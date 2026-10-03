# Remaining: iOS PWA / Gyro / Background Resume

Status: not included in this PR.

Critical issues:
- gyro works on Android and iOS Safari but cannot be enabled in iOS Home Screen Web App
- UI can direct users to a setting that does not actually exist
- leaving the screen/app can make an active battle impossible to resume

Investigate current WebKit behavior:
- DeviceOrientation/DeviceMotion permission and transient activation
- Safari vs standalone mode
- visibilitychange/pagehide/pageshow/BFCache
- simulation clock, input, gyro, audio, network and renderer resume

Acceptance:
- no fictional Settings guidance
- repeated suspend/resume does not duplicate loops/listeners
- no huge first-frame dt
- Android/Safari regressions preserved
- iOS standalone real-device acceptance checklist
