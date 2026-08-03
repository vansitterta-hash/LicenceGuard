# Read-only intelligence preview

Milestone B is disabled by default and does not alter application data or outcomes.

To enable it locally, add this explicit opt-in to `.env.local`:

```text
EXPO_PUBLIC_LG_READ_ONLY_INTELLIGENCE=true
```

Restart Expo with a cleared development cache:

```text
npm run web -- --clear --port 8081
```

Open a client application workspace. The preview appears above the guided workflow and is labelled:

> Read-only intelligence preview — does not change this application.

To disable it, remove the variable or set it to `false`, then restart Expo. No other intelligence feature flag is enabled by this setting.
