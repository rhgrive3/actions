# Ranked objective model acceptance

Fixed game source: cd18eefdfd5b537eaba0b701e232c4b6d0c93666, tree cfafdf6394f040f17ed6e088ae0bd3f53eb0c08e.

The diagnostic performs one ordinary production build. It validates all build input hashes and all generated artifact hashes, serves only that build's immutable content revision, and requires delivery of the actual objective modules, native game context, character/weapon entry points and Three.js. No source-frame or pose dataset is an input.

Source acceptance is 21 objective component cases, 3 actual Rainmaker Actor cases, 6 existing ranked-world cases and 3 model geometry/material signatures. The same 3 Actor cases and 3 model signatures run against the emitted build. Signatures compare every geometry attribute/index byte and material settings; they are not a substitute for raster acceptance.

The browser uses software WebGL and the existing production day environment with 256-pixel PMREM and exposure 0.94. It creates states directly from delivered public game code:
- 24 Clam component images: both teams, six field/inventory/conversion/throw states, near and far.
- 4 actual local carrier images: both teams, seven small clams and a Power Clam. Native clocks and pose ownership, visible inventory pixels, projected bounds and objective draw/triangle increments are required. These images permit inspection of rear attachment and scale with an unchanged character.
- 18 Rainmaker images: model-only states and two real-carrier views. The final helper's strict tuple and native-clock contract is mandatory.

Clam conversion and throws use the actual ClamsRule. The flat floor and component-only carrier records in the 24 Clam images are synthetic. Actual native local Actors are used for the separate carrier views and Rainmaker. Rainmaker projectile sinks mean these captures qualify rest, charge and attachment presentation, not firing physics. Full-stage performance, network, device crash behavior, RSS and character asset quality remain outside this diagnostic.

Every image is saved before final receipt validation. Partial checkpoints are saved after each lane and on failure. Lane failures do not prevent later lanes from running, but any failure fails the entire job. Page exceptions, console errors, network failures, shader errors, context loss, blank images, wrong tuples, wrong model work or clipping fail closed. Cleanup attempts all owned resources and preserves the original failure. Artifacts upload on failure too.

Successful CI does not replace visual inspection of the final 46 PNGs for silhouette, clipping, ground burial and body/hand interference. No model, rule, throw timing, damage, hair or character asset is modified by the diagnostic.
