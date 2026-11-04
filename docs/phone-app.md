# Print It! on Android

Open the HTTPS website in Chrome on your phone. Open the member card at the
bottom of the menu, then choose **Install on your phone** on the **Member** page,
or visit `/install`. Tap **Install Print It!** when
available. You can also use Chrome's **⋮ → Add to home screen → Install** (or
**Install app**). Choose installation when offered so Android registers the app
in its Share menu.

The Member page hides **Install on your phone** when this device has installed
Print It!. Home-screen launches (including iOS) and new installations are detected
automatically. Chrome also checks for an existing installation from a browser tab.
Installation evidence is remembered in this browser, rather than on your account,
so installing on one device does not hide installation on another. A new Chrome
install offer or a successful browser check after uninstalling clears that evidence.
Browsers without the installation-query API can only recognize a home-screen
launch or an installation previously observed in that browser; iOS may keep Safari
and home-screen app storage separate.

Open the installed app and sign in as the printer owner. **Remember this device**
keeps the phone signed in. In Amazon, open the exact filament/color listing,
tap **Share**, then choose **Print It!** (possibly under **More**).

Choose the brand, review the imported material, color, hex and package size,
and tap **Add listing**. The listing is saved using the existing owner-only,
audited catalog action. Enabled brands and listings appear in the market picker
and spool search. Existing exact links for the chosen brand open for editing.
If Amazon blocks the lookup, enter the details manually. Add missing brands in
**Brands & Amazon links**. You can also paste links at `/share-filament`.

Direct Amazon listings and Amazon's `a.co`, `amzn.to`, `amzn.eu` and `amzn.asia`
short links are supported. Shared URLs are extracted from the URL, text or
title fields because Android apps often include a link in the shared text.
Sign-in redirects keep the received link. Receiving a share only opens a draft;
saving requires the owner's explicit form submission.

An internet connection is required for catalog changes. Offline navigation shows
a public reconnect screen and keeps the shared URL in that window; reopen the
connection and tap **Try again**. Nothing is saved until submitted online.
The service worker caches only public fallback assets, never authenticated
pages, filament data or API responses.

Run `npm run verify:phone` for installation detection, share parsing, manifest/icon
checks and worker network/offline checks. Android's actual Share menu registration must be checked
on a phone after installing from the deployed HTTPS site.
Use `npm run verify:phone -- --url https://your-site.example` to also check the
public installation assets and signed-out share/auth behavior on a running site.
