#!/usr/bin/env ruby
# GitHub can reject an invalid workflow before creating any jobs. Audit the
# source YAML independently so a broken workflow is still diagnosed in CI.
require 'psych'

module INKWAVEWorkflowYAML
  module_function

  def visit(node, filename, errors)
    case node
    when Psych::Nodes::Mapping
      seen = {}
      node.children.each_slice(2) do |key, value|
        if key.is_a?(Psych::Nodes::Scalar)
          if (original_line = seen[key.value])
            errors << "#{filename}:#{key.start_line + 1}: duplicate YAML key #{key.value.inspect} (first at line #{original_line})"
          else
            seen[key.value] = key.start_line + 1
          end
        else
          errors << "#{filename}:#{key.start_line + 1}: mapping key must be a scalar"
        end
        visit(value, filename, errors) if value
      end
    when Psych::Nodes::Sequence, Psych::Nodes::Document, Psych::Nodes::Stream
      node.children.each { |child| visit(child, filename, errors) }
    end
  end

  def check(filename)
    errors = []
    begin
      stream = Psych.parse_stream(File.binread(filename), filename: filename)
      if stream.children.length != 1 || !stream.children.first.root.is_a?(Psych::Nodes::Mapping)
        errors << "#{filename}: expected exactly one YAML mapping document"
      else
        visit(stream, filename, errors)
      end
    rescue Psych::SyntaxError => error
      errors << "#{filename}:#{error.line}: YAML syntax error: #{error.problem}"
    rescue SystemCallError => error
      errors << "#{filename}: cannot read workflow: #{error.message}"
    end
    errors
  end

  def files(paths)
    paths.flat_map { |path|
      if File.directory?(path)
        Dir.glob(File.join(path, '**', '*.{yml,yaml}')).sort
      else
        [path]
      end
    }.uniq
  end
end

if $PROGRAM_NAME == __FILE__
  paths = ARGV.empty? ? ['.github/workflows'] : ARGV
  files = INKWAVEWorkflowYAML.files(paths)
  abort 'No workflow YAML inputs discovered' if files.empty?
  errors = files.flat_map { |file| INKWAVEWorkflowYAML.check(file) }
  if errors.empty?
    puts "CI YAML integrity OK: #{files.length} workflow file(s), no duplicate keys"
  else
    warn errors.join("\n")
    warn "CI YAML integrity FAILED: #{errors.length} issue(s) in #{files.length} file(s)"
    exit 1
  end
end
