# Form Pilot

Form Pilot is a Manifest V3 Chrome/Brave extension for recording and replaying form workflows. It can fill fields, choose options, set checkboxes, click controls, pause for human actions, navigate between websites, and wait for a configurable duration.

Form Pilot never solves or reads captchas, passwords, or OTPs. Those steps pause the run so you can complete them yourself.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` or `brave://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the `form-pilot` folder.
5. Pin Form Pilot from the browser extensions menu.

After source changes, use the extension page's **Reload** button before testing.

## Record A Flow

1. Open the starting website.
2. Open the Form Pilot popup and enter a flow name.
3. Select **Record**.
4. Use the page normally. Form Pilot records meaningful field changes, selections, checkbox changes, clicks, and Enter key presses.
5. Use **Add pause** in the on-page recording bar whenever a human checkpoint is needed.
6. Select **Stop & save**.

Recorded flows are stored locally in `chrome.storage.local`.

## Customize A Flow

Open the extension's **Manage** page from the popup. The flow editor supports:

- Editing the flow name and starting website URL.
- Adding a new blank flow without recording.
- Adding, editing, duplicating, deleting, and reordering steps.
- Inserting a manual pause between any two steps.
- Editing element locators, values, profile bindings, timeouts, checkbox state, and key names.
- Adding website navigation steps and timed wait steps.
- Importing and exporting flows as JSON.

### Supported Step Types

| Type | Purpose |
| --- | --- |
| `type` | Fill an input or text area. |
| `select` | Choose a dropdown option. |
| `check` | Set a checkbox or radio button state. |
| `click` | Click a button, link, tab, or other control. |
| `key` | Press Enter on a located element. |
| `manualPause` | Pause for a human action and resume manually. |
| `captchaPause` | Pause when a captcha must be completed. |
| `navigate` | Open a configured URL. |
| `wait` | Wait for a configured number of milliseconds. |

When a step cannot find its element, the runner pauses with the error and offers retry or skip. Search timeout and automatic retry/skip behavior can be changed in **Manage > Settings**.

## Profiles

Profiles hold reusable named values such as `pilgrim1.name` or `account.phone`.

1. Create a profile in **Manage > Profiles**.
2. Add named fields and values.
3. Select a profile field for a `type` or `select` step in the flow editor.

The same recorded flow can then run with different profile data. Password and other sensitive fields can be configured to ask at run time instead of storing a value.

## JSON Import And Export

Use **Export JSON** on a flow to create a portable workflow file. Literal field values are removed from exports by default to reduce accidental sharing of personal data. Imported JSON must contain a `steps` array; imported flows receive a new local ID.

Review imported flows before running them, especially navigation URLs and click steps.

## Permissions And Data

The extension requests:

- `storage` to save flows, profiles, settings, and active run progress locally.
- `tabs` to inspect the active tab and start a flow there.
- `scripting` to load the runner when needed.
- HTTP and HTTPS host access so it can record and replay workflows on normal websites.

No project service or remote API is used. Do not create flows containing secrets unless you understand that browser-local extension storage is not a password manager.

## Test Page

The repository includes [test/test-form.html](test/test-form.html). Open it directly in the browser, or serve the repository with:

```powershell
python -m http.server
```

Then open `http://localhost:8000/test/test-form.html`. Direct `file://` testing may require enabling **Allow access to file URLs** on the extension details page.

## Project Layout

| Path | Responsibility |
| --- | --- |
| `background/service-worker.js` | Starts and stops recording and replay runs. |
| `content/recorder.js` | Captures page actions. |
| `content/replayer.js` | Executes flow steps and persists progress. |
| `content/core.js` | Locators, element resolution, waits, and field setters. |
| `options/options.html` and `options/options.js` | Settings, profiles, flow editor, and JSON transfer. |
| `popup/popup.html` and `popup/popup.js` | Recording and replay controls. |
| `test/test-form.html` | Local test form. |

## Safety

Only automate websites where you have permission and where automation is allowed by their terms. Always review the completed form before submitting it.
