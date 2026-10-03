# Platform lifecycle / gyro — real-device acceptance checklist

Run against the exact candidate build and record device, OS, browser/display mode and revision.

## iPhone Safari
- GYRO off -> tap GYRO -> native prompt occurs from the tap.
- Grant: sensor samples arrive and camera responds.
- Deny: UI reports denial without pointing to a nonexistent Settings item.
- Hide/show 20 times during battle: no duplicated camera/input/audio behavior.
- 30s background gap: no catch-up burst, teleport or camera jump.
- portrait/landscape change: next orientation sample becomes a clean reference.

## iOS Home Screen Web App
Repeat the Safari cases from the installed Web App itself. Do not infer standalone behavior from Safari permission state.

Record:
- whether requestPermission exists
- returned value/error
- whether deviceorientation samples arrive
- whether app resumes after Home/app switch/screen lock
- whether a process kill produced a cold launch rather than a true resume

## Android Chrome / installed PWA
- Existing GYRO remains usable.
- stationary device does not drift from biased rotationRate.
- app switch/home/lock cycles do not duplicate sensor listeners.
- orientation change does not produce infinite rotation.

## Battle resume
During active battle:
- fire/move/look, then background while inputs are held
- return after short and 30s gaps
- no stale shot/bomb/jump from old input
- no huge simulation dt
- audio returns once
- menu/game loop does not duplicate
- network either survives/reports disconnect using existing contract

## WebGL
If context loss can be triggered safely:
- visible recovery message
- no hidden simulation catch-up
- restored context resumes once
- unrecoverable context does not silently pretend the battle survived

PASS only after real-device evidence is recorded; CI WebKit/Chromium mocks are not substitutes for Home Screen Web App behavior.
