# Form Pilot v0.1

Record a form-filling flow once, replay it in seconds. Pauses for captchas and passwords (never solves them).

## Install (Brave / Chrome)
1. Unzip this folder.
2. Open `brave://extensions` (or `chrome://extensions`), turn on **Developer mode**.
3. Click **Load unpacked** and pick the `form-pilot` folder.
4. Pin the extension.

## Use
1. Open the site, click the extension, name the flow, press **Record**, fill the form normally.
2. Press **Stop & save** in the on-page bar.
3. (Optional) Options page: create a profile (e.g. `pilgrim1.name`) and link steps to profile keys.
4. Open a tab, click the extension, choose a profile, press **▶ Run**.

Captcha and password/OTP steps pause the run; do them yourself and press **Resume**.
Always review the form before submitting. Only automate sites whose terms allow it.

## Try it first
Open `test/test-form.html` in the browser (allow the extension on file URLs under extension details if you want to use it there, or serve it with `python3 -m http.server`).
