# Handover: Voice eligibility assistant (Gujarati) — state as of 2026-10-07

Repo: /Users/sameerkhanna/Documents/Projects/Citizen-Services (branch main, local commits 5201e63, 179ffe5, c5b8d6b and 486c2c7 NOT pushed).

## Done and deployed
- Host-side STT worker (5201e63): Gujarati clip ~6 s via the Mac vs ~19-35 s in the pod. Pod falls back to its own Whisper if the worker is down.
  - Worker: `ai-intelligence-service/scripts/run_stt_worker.sh` (uses `PYTHON=$HOME/.dg20-stt-venv/bin/python`; venv pinned to faster-whisper 1.1.0, av 18.1.0, huggingface_hub 0.36.2 to match the pod). Token: `~/.dg20-stt-token`; k8s secret `stt-worker` (key `token`, created without trailing newline). Log: `~/.dg20-stt-worker.log`.
  - **Auto-start (installed 2026-10-07):** launchd agent `com.dg20.stt-worker` (KeepAlive, starts at login). launchd cannot read ~/Documents, so it runs a copy of config.py, speech_engine.py and stt_worker.py from `~/.dg20-stt-worker`. After changing those files re-run `ai-intelligence-service/scripts/install_stt_worker.sh` to refresh the copy. Stop it with `launchctl bootout gui/$(id -u)/com.dg20.stt-worker`. `run_stt_worker.sh` is now only for manual runs.
  - Pod reaches the host at http://host.docker.internal:8091.
- OLLAMA_MODEL is now `gemma3:4b` (config.py, explain.py, k8s.yaml). docs/DG20_AI_Digit_and_Insights.md still says gemma4:e4b.
- Parser fixes (179ffe5): unseen batch of 17 synthetic clips scored 59/87 slots -> 83/87. Remaining misses are Whisper errors (39 heard as 40, 33 as 30, 1.05 lakh as 1,5,000,000, janjati heard as jati). 101 tests pass (`ai-intelligence-service/.venv/bin/python -m pytest`). Those clips are now fixtures, so 95% is tuned; a fresh batch should be expected to score ~85-90%.

- Confirm step (486c2c7, citizen-portal, deployed): after a voice utterance completes the profile, any age/income not yet approved is read back ("I heard age 36 years, yearly income ₹1,20,000...") and eligibility runs only after "Confirm and check". Values typed into the chips count as confirmed; a later utterance that changes age/income asks again; Reset clears it. EN + GU strings in locales; 4 new tests in VoiceEligibilityAssistant.test.jsx (portal suite 98/98). Verified in Chrome on 2026-10-07 with a stubbed mic and a Gujarati transcript (real parser + eligibility calls); not tried with a real voice.

## Security lock-down (2026-10-07, commits 6a19ed5, 8f163e6, 5ccf485)
- scheme-engine-service now requires officer roles (OfficerSecurityConfig): `/v1/admin/run-identification` SCHEME_DEPT+DEPT_ADMIN; `/v1/admin/fraud-signals` REVENUE_OFFICER+DEPT_ADMIN; other `/v1/admin/**` IT_ADMIN+DEPT_ADMIN; POST/PUT/DELETE `/v1/schemes`, beneficiary decisions (`/v1/beneficiaries/**` writes) and POST/DELETE `/v1/rules` SCHEME_DEPT+DEPT_ADMIN. Reads and the simulator stay public. Role lists are configurable (`officer.admin.*`).
- scheme-application-service calls `confirm-application` and `{id}/confirm` with a shared key: header `X-Internal-Key`, env `INTERNAL_SERVICE_KEY`, k8s secret `internal-service-key` (key `key`). The key opens only those two endpoints.
- officer-portal now sends the officer token on beneficiary actions, scheme scan and deactivate.
- Still unauthenticated: other services' write endpoints were not reviewed. seed_data/generate_large_dataset.py and some docs still say to POST /v1/admin/run-identification without a token.
- Tests: `JAVA_HOME=$(/usr/libexec/java_home -v 17) mvn -o test` in scheme-engine-service (default Java 25 breaks Mockito). AdminEndpointSecurityTest covers the rules.
- **The Java services do not run their image's jar.** scheme-engine-service and scheme-application-service deployments bind-mount `<repo>/<service>/target/<service>-1.0.0.jar` from the working tree (hostPath). To deploy: build the jar (Java 17, `mvn -o package -DskipTests`), swap it into that path with `mv`, then `kubectl -n citizen rollout restart deploy/<service>`. Only officer-portal is image-based. Building elsewhere changes nothing live.
- Another effort (Expenditure Integrity: expenditure-integrity-service, ExpenditureIntegrity screens, nginx changes, api.js/auth.js/App.jsx edits) was uncommitted in the same tree; its api.js redirects fraud-signals to the new service.

## Open
1. Try the confirm step with a real voice, in Gujarati UI mode too (browser check used stubbed audio, English UI).
2. Fresh unseen batch to re-measure; ideally real human recordings, not gTTS.
4. `/v1/admin/**` endpoints other than the secured ones are unauthenticated; grievance-service manifest has a dated image tag; pptx/videos are untracked: never commit them.
5. Live pod has no leftover `kubectl set env` overrides now (k8s.yaml re-applied).

## Environment gotchas
- AI deployment rollouts: the new pod stays Pending (node memory) until the old pod is deleted. Delete the old pod by hand.
- The project `.venv` under ~/Documents can hang on import while iCloud materializes files; the repo is iCloud-synced. Never run recursive greps over the whole repo.
- citizen-portal tests: the in-repo node_modules is damaged by iCloud (vitest fails with ECANCELED / "Timeout waiting for worker"). Run them from a clean copy: rsync src and configs to a non-iCloud dir, `npm ci`, `npx vitest run`. Better: exclude the repo from iCloud sync.
- Portal rebuild uses the build args in build_all_portals.sh (citizen-portal block), tag `arm64-local`, then `kubectl -n citizen rollout restart deploy/citizen-portal`.
- Build images with `DOCKER_HOST=unix://$HOME/.rd/docker.sock`, tag `arm64-local`, namespace `egov`; a rebuild takes 10+ minutes. Service port is 8089.
- Stage explicit paths; never `git add -A`. Don't commit/push unless asked; don't echo demo credentials.
