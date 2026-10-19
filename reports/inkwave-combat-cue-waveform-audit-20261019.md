# Original 2022 S3 combat-hit candidate comparison (2026-10-19)

Status: Research-only; exact Nintendo Ver.11.3.0 SLINK event routing and redistribution rights not verified.
Sources: user Drive research folder https://drive.google.com/drive/folders/13DK-NwVCXJVtB9JHcO2WGJ-9uG1o24JV and two earlier user-supplied Voicemod comparison captures.

Method: Decode each MP3 using FFmpeg to 16 kHz mono float PCM, subtract mean, compute FFT full-lag cross-correlation, and normalize by full-clip L2 energy. This is waveform identity evidence, not a probability or an engine event-tree reconstruction.

| Original 2022 file | Duration | Direct-hit clip correlation | Charger-hit clip correlation |
|---|---:|---:|---:|
| HitEf_CriticalHit_00.mp3 | 0.6531 s | **0.8630** | **0.8647** |
| HitEf_Damage_00.mp3 | 0.1306 s | 0.1155 | 0.1204 |
| HitEf_InkHit_Focused_Normal_00.mp3 | 0.2400 s | 0.0633 | 0.0645 |
| HitEf_InkHit_Focused_Strong_00.mp3 | 0.4080 s | 0.0704 | 0.0711 |
| HitEf_InkHit_SuperStrong_00.mp3 | 1.0320 s | 0.0773 | 0.0779 |

The original HitEf_CriticalHit waveform closely matches both third-party direct-hit captures despite framing shifts. The other HitEf candidates are distinct sounds; the recordings alone cannot confirm whether Nintendo layers them simultaneously.

Inkipedia Damage and contemporary direct-hit player reports distinguish full-charge direct Charger contact from a damage/kill threshold: even a fully charged nonlethal hit may produce a special cue, whereas some partial-charge lethal hits do not. The source-backed audio PR now uses admitted shot charge, not damage >=95.
References: https://splatoonwiki.org/wiki/Damage and https://splatoon-torikara.com/archives/29861

Unverified: precise SLINK property branches, layered event timing, relative gain, whether Pl_DeadSplash and Pl_DeadBubbleSplash ever coincide, charger full charging rise envelope, retail Ver.11.3.0 event parity. Do not promote these hypotheses to verified original decision-tree rules.