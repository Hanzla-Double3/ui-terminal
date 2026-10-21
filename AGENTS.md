# Standalone terminal development

This project is independent of FayPOS. Do not add POS endpoints, account/licensing
logic, backend credentials or imports from another checkout. Keep the package
private until its owner chooses its public name and licence and requests publication.

All execution enters through terminal input and leaves through terminal output.
Platform controls register existing UI interactions. Do not introduce a parallel
agent/testing action API. The initial visible terminal owns one input/output pair;
The authorized local stdio/OS-pipe transport relays this same stream with exclusive controller ownership. Remote network transports remain future scope.

Review README.md, docs/STREAMS.md and docs/WALKTHROUGH.md when behavior changes.
Update the command examples, limitations, walkthrough expectations and appropriate
engine/browser tests. Do not treat dispatch or UI re-render as durable success.

Use npm build/test scripts. Heavy local jobs are sequential, with the shared Linux
lock, CPU/heap limits and one test worker. Do not run packaging and browser suites
at the same time. Native platform support requires actual platform evidence.

Do not store raw secret field values in output/history or bypass ordinary host
validation, disabled state, modal isolation or permission checks. No remote server,
window-global executor or automatic retry of an ambiguous write.
