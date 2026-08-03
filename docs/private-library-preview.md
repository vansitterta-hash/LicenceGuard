# Private-library preview

Milestone C is disabled by default. It builds virtual folders from existing document metadata and relationships without moving or changing records.

Enable it locally in `.env.local`:

```text
EXPO_PUBLIC_LG_PRIVATE_LIBRARY_INTEGRATION=true
```

To inspect the same private-library classification in the Milestone B panel, also enable:

```text
EXPO_PUBLIC_LG_READ_ONLY_INTELLIGENCE=true
```

Restart Expo after changing either flag:

```text
npm run web -- --clear --port 8081
```

The preview appears in the existing client Document Library. Remove the variable or set it to `false`, then restart Expo, to disable it.
