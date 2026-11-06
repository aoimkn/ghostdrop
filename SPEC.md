# ghostdrop Specification

## 1. Overview

ghostdrop is a web service for handing clipboard contents and files from one of your devices to another. A transfer is end-to-end encrypted, held on the server only briefly, and destroyed as soon as it is received.

Anyone can sign up. Each account is private to its owner: drops only travel between that owner's devices.

### Goals

- Move anything you can copy, paste, drop or pick — text, rich text, images, files — between your own devices.
- The server never sees plaintext.
- Nothing persists: a transfer disappears once received, or after a short expiry.
- Runs in any modern browser; no native app, no device-specific assumptions.

### Non-goals

- Sharing with other people.
- History, sync, or any form of long-term storage.
- Local-network or peer-to-peer transfer.

## 2. Terminology

| Term         | Meaning                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Account      | One owner's identity. Nothing crosses accounts.                                                                  |
| Device       | A browser in which the owner has signed in and unlocked the account with the passphrase. Each device has a name. |
| Drop         | One transfer: one or more items sent together from one device.                                                   |
| Item         | A single piece of content within a drop: a MIME type, an optional file name, and bytes.                          |
| Pending drop | A drop that has been sent and not yet received, deleted or expired.                                              |
| Burn         | Irreversible deletion of a drop from the server.                                                                 |

## 3. Security

### Guarantees

- The server cannot read the content, MIME types or file names of any drop.
- Content that has been altered, reordered, mixed between drops or truncated is detected and rejected by the receiving device.
- Once burned, a drop cannot be retrieved by anyone, including the owner.

### What the server can see

The account, its devices, and for each drop: the sending device, the target device if one is set, the number of items, approximate sizes and timing.

### Assumptions

- The server delivers the genuine client code. As with any web app doing client-side encryption, a malicious server could serve code that leaks keys; ghostdrop does not defend against this.
- The owner's devices are not compromised.
- The passphrase resists guessing. Anyone holding the server's data can try passphrases offline, so the guarantees above are only as strong as the passphrase.

## 4. Accounts & devices

### Sign-up and sign-in

- Signing up and signing in use a passkey. No password.
- ghostdrop is designed around synced passkeys: one registration makes the passkey usable on every device where the owner's credential manager syncs. No particular credential manager is assumed.
- An account can have multiple passkeys. While signed in, the owner can add a passkey (e.g. when moving to another credential manager) after confirming with an existing one, and remove one, as long as at least one remains.
- There is no account recovery. An owner who loses access to all of their passkeys signs up for a new account.

Rationale: only adding a passkey asks for confirmation because an added passkey grants lasting access. Other changes made from a signed-in device, such as removing a passkey or a device, at worst disrupt the owner, who notices.

Rationale: recovery would need a second identity channel such as email, which ghostdrop otherwise has no reason to collect. An account holds nothing worth recovering beyond pending drops, which expire shortly anyway.

### Passphrase

- At sign-up the owner chooses a passphrase. It is the source of the encryption key and never leaves the owner's devices.
- The owner is expected to keep it in their credential manager alongside the passkey.
- Each new device asks for the passphrase once. A wrong passphrase is detected immediately.
- Changing the passphrase burns all pending drops. Other devices stay on the account but cannot send or receive until the new passphrase is entered on them.
- A forgotten passphrase can be replaced with a new one. Only pending drops are lost, since nothing else is stored.

Rationale: the WebAuthn PRF extension could derive the key from the passkey itself and remove the passphrase. It is not used because some credential managers do not return PRF output for the passkeys they store, and ghostdrop must work with any synced passkey.

### Devices

- A device is added to the account when the owner signs in and enters the passphrase and a name on it.
- Device names are unique within the account and are shown when choosing a target and on pending drops. The owner can rename a device and remove it from the account. Removing a device signs it out immediately.
- A device is removed when it signs out or its session expires. Signing in again in the same browser adds it as a new device.
- Drops targeted at a device are burned when the device is removed.

### Account deletion

The owner can delete their account. Its passkeys, devices and pending drops are deleted immediately. Inactive accounts are never deleted automatically.

## 5. Drops

### Sending

- The owner creates a drop from one or more items on any device. The items' contents together may not exceed the maximum drop size, and a drop may hold at most the maximum number of items.
- Optionally, the owner picks a target device. Without a target, any other device of the account can receive the drop.
- A drop becomes visible to other devices only once it is completely uploaded. An upload that makes no progress for the upload timeout is abandoned.

### Pending drops

- An account can hold multiple pending drops, up to a limit. Drops still being uploaded count toward it.
- A drop sent while the account is at the limit is rejected. Existing drops are never removed to make room, since a burn cannot be undone.
- Every eligible device sees the pending drops addressed to it: those targeted at it, and untargeted ones it did not send.
- Online devices are notified when a new drop arrives.
- Any device of the account can delete a pending drop without receiving it.

### Receiving

- A device receives a drop by downloading and decrypting it.
- The drop is burned as soon as one device confirms it has received the drop. An untargeted drop therefore goes to whichever device receives it first.
- If a download fails before confirmation, the drop stays pending and can be retried.

### Expiry

A pending drop that is not received or deleted within the expiry period is burned.

## 6. Content handling

### Input

Existing content — anything that already exists on the device:

- the clipboard (paste)
- files and folders in storage (file or folder picker, drag and drop)
- content in other apps (drag and drop)

New content — created within ghostdrop for the drop:

- the keyboard (text written in ghostdrop)
- the camera (photo or video)

Every item is carried as-is: original MIME type and bytes, no conversion.

### Output

- Items of type `text/plain`, `text/html` or `image/png` can be written to the receiving device's clipboard.
- All other items are delivered as a download or through the share sheet.

Rationale: these three are the only types the Clipboard API requires browsers to support for writing. Others (e.g. `image/jpeg`) are rejected by some browsers, so they are not offered as clipboard targets.

## 7. Language

- The interface is available in Japanese and English.
- On first visit, the language follows the browser's preference, falling back to English.
- The owner can switch the language. The choice is remembered on that device.

## 8. Limits

| Limit                             | Value                         |
| --------------------------------- | ----------------------------- |
| Expiry period                     | 24 hours                      |
| Maximum drop size                 | 100 MiB                       |
| Maximum pending drops per account | 10                            |
| Maximum items per drop            | 1,000                         |
| Upload timeout                    | 1 hour                        |
| Minimum passphrase length         | 15 characters                 |
| Maximum device name length        | TBD                           |
| Session lifetime                  | 30 days, extended on each use |
