# Optional semantic proposal critics

This experiment holds proposal fixtures and deterministic validation fixed. The candidate adds one read-only semantic critic that can emit cited findings but cannot edit or commit.

Run the registered three-trial comparison:

```powershell
powershell -ExecutionPolicy Bypass -File .\experiments\proposal-critics\run.ps1
```

See [PREREGISTRATION.md](PREREGISTRATION.md) for the protocol and gates.
