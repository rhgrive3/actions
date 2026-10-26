#!/usr/bin/env python3
import argparse
import json
from lib.inkwave_source_mirror import Limits, mirror

parser = argparse.ArgumentParser(description='Download a bounded public upstream candidate for review only')
parser.add_argument('destination')
parser.add_argument('--base', default='https://inkwave-six.vercel.app/')
parser.add_argument('--max-resource-bytes', type=int, default=Limits.resource_bytes)
parser.add_argument('--max-total-bytes', type=int, default=Limits.total_bytes)
parser.add_argument('--max-resources', type=int, default=Limits.resources)
parser.add_argument('--max-seconds', type=float, default=Limits.seconds)
parser.add_argument('--socket-seconds', type=float, default=Limits.socket_seconds)
parser.add_argument('--max-redirects', type=int, default=Limits.redirects)
args = parser.parse_args()
result = mirror(args.base, args.destination, Limits(args.max_resource_bytes, args.max_total_bytes, args.max_resources, args.max_seconds, args.socket_seconds, args.max_redirects))
print(json.dumps(result))
raise SystemExit(1 if result['failed'] else 0)
