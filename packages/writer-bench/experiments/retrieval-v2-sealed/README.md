# Retrieval v2 sealed validation

This experiment evaluates the frozen retrieval-v2 candidate once on the synthetic CC0 Glass Orchard corpus. See [PREREGISTRATION.md](PREREGISTRATION.md) for the systems, protocol, gates, and graduation rule fixed before execution.

Run deterministic retrieval and the three-trial DeepSeek comparison:

```powershell
powershell -ExecutionPolicy Bypass -File .\experiments\retrieval-v2-sealed\run.ps1
```

Use `-RetrievalOnly` to stop after deterministic retrieval. Benchmark outputs remain under `.results`; the immutable summary is checked into `RESULTS.md` after execution.
