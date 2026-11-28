# Publishing the devholm.com privacy notice

The notice is off in standard DevHolm template installs. The devholm.com deployment publishes its own notice through the existing developer-page settings.

1. Set `DEVHOLM_PRIVACY_EFFECTIVE_DATE` on the devholm.com app process to the actual publication date in `YYYY-MM-DD` format, then restart the app. An unset or invalid date leaves the notice off. For containers, pass the setting to the running app.
2. In **Admin → Pages → Dev Pages**, confirm that **Privacy** is enabled and **Footer Resources** is selected, then save any changes. Use `Privacy` as the label and `/privacy` as the path. The app seeds these preferences on first registration. Check them in the deployed database-backed settings because saved preferences take precedence.
3. Open `/privacy` and follow the **Privacy** link from the public footer.

The host-level `devholm-analytics-purge.timer` runs daily at 03:45 UTC and removes detailed page views older than 180 days. Aggregate counts are retained. The app also offers an on-demand cleanup helper with the same default cutoff.
