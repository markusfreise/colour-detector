Read `docs/backlog.md` and take the task with the lowest open ID whose dependencies are all done.

1. Tell me task ID, title and acceptance criteria, then wait for my OK.
2. Create `feature/TASK-xx-<short-name>` off `develop`.
3. Implement strictly according to the PRD — ask about gaps instead of guessing.
4. Write tests that check the acceptance criteria and run `npm test` and `npm run build`.
5. Commit as `<type>(TASK-xx): <summary>`.
6. Mark the row in `docs/backlog.md` (and PRD §17) as done and commit as `docs(TASK-xx): update backlog`.

Stop afterwards. Do not start the next task automatically.
