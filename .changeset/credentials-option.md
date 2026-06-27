---
'prest-js-sdk': minor
---

feat: add `credentials` option to PrestConfig

Allows setting `fetch` credentials mode (e.g. `"include"`) for
cross-origin cookie-auth scenarios such as pREST behind Ory Oathkeeper
validating a Kratos session. Defaults to fetch's `"same-origin"` when
omitted.
