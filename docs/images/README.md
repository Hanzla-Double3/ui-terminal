# Screenshot maintenance

These JPEGs were captured from the actual local demo on 20 October 2026 using its
normal visible terminal. They contain disposable stationery fixtures only.

| Image            | Demonstrates                                               | Refresh when                                               |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `playground.jpg` | Real catalogue/cart UI and a scoped cart-line listing      | Catalogue, control paths, output or dock layout changes    |
| `completion.jpg` | `products.j` + Tab producing `products.journal.`           | Completion grammar, paths or suggestions change            |
| `dialog.jpg`     | A rename dialog with only active-dialog controls available | Modal scope, dialog layout or command availability changes |

Keep screenshots as actual application output, with surrounding UI context. Do
not composite fake successes or put real customer records, credentials, accounts
or private host configuration into examples. Cancel demo dialogs after capture.

Use the user's normal viewport for interactive captures. If tests capture a
specific responsive breakpoint, record its actual dimensions and test context.
Documented images belong here; scratch screenshots and browser traces belong in
ignored `artifacts/` or `test-results/`, not the source commit.
