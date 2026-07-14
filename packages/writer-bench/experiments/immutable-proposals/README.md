# Immutable edit proposal experiment

This experiment holds the model and task-aware context fixed while changing the output mechanism. The control returns normal editorial prose. The candidate returns a structured replacement that the harness seals into a deterministic, content-addressed, uncommitted proposal.

Run the registered three-trial comparison:

```powershell
powershell -ExecutionPolicy Bypass -File .\experiments\immutable-proposals\run.ps1
```

See [PREREGISTRATION.md](PREREGISTRATION.md) for the fixed protocol and gates.
