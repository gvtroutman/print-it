# Project rules

## Commit and push after each change

After completing each requested project change, run checks appropriate to the change,
commit the task's changes, and push the commit to the current branch's configured
remote before reporting completion. This applies to code, UI, configuration,
documentation, and project rules. Do not wait for a separate request to commit or
push unless the user explicitly asks otherwise.

Stage only files belonging to the current task. If a push fails, retry `git push`
once (two attempts total) before reporting it as failed. If committing fails or
both push attempts fail, report the failure and preserve the local changes.
