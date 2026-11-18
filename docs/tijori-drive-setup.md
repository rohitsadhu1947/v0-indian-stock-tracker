# Letting the app read the Tijori report from Google Drive

The app needs its own read-only Google login, called a service account, to read one Drive folder. This takes about ten minutes. You do it once.

Nothing here gives the app access to the rest of your Drive. It can only see the one folder you share with it.

## Part 1: Make the Drive folder

1. Open [drive.google.com](https://drive.google.com).
2. Click **New**, then **New folder**. Name it `Tijori reports`. Click **Create**.
3. Open the folder. Look at the address bar. It ends with something like `folders/1AbCdEfGhIjKlMnOpQrStUv`.
4. Copy the part after `folders/`. This is the **folder ID**. Keep it for Part 4.

## Part 2: Create the service account

1. Open [console.cloud.google.com](https://console.cloud.google.com) and sign in with the same Google account.
2. At the top of the page, click the project name, then **New project**. Name it `stock-tracker`. Click **Create**. Wait for it to finish, then select it.
3. In the search bar at the top, type `Google Drive API`. Click the result, then click **Enable**.
4. In the search bar, type `Service accounts`. Click the result under IAM and Admin.
5. Click **Create service account**.
6. Name it `tijori-reader`. Click **Create and continue**.
7. Skip the two optional steps. Click **Done**.
8. You now see the account in a list. Copy its email address. It looks like `tijori-reader@stock-tracker-123456.iam.gserviceaccount.com`. Keep it for Part 3.

## Part 3: Download the key and share the folder

1. In the same list, click the account's email address.
2. Click the **Keys** tab.
3. Click **Add key**, then **Create new key**. Choose **JSON**. Click **Create**.
4. A file downloads to your computer. This file is a password. Do not email it, do not put it in chat, and do not add it to the code.
5. Go back to Google Drive. Right-click the `Tijori reports` folder and click **Share**.
6. Paste the service account's email address from Part 2. Set the role to **Viewer**. Untick "Notify people". Click **Share**.

## Part 4: Give the key to the app

1. Open [vercel.com](https://vercel.com), open the project `v0-indian-stock-tracker`, then **Settings**, then **Environment Variables**.
2. Add the first variable:
   - Name: `GOOGLE_SERVICE_ACCOUNT_KEY`
   - Value: open the downloaded JSON file in a text editor, select everything and paste it.
   - Environment: Production.
3. Add the second variable:
   - Name: `TIJORI_DRIVE_FOLDER_ID`
   - Value: the folder ID from Part 1.
   - Environment: Production.
4. Click **Save** for each.
5. To test on your own Mac as well, add the same two lines to the file `.env.local` in the project folder. Put the JSON on one line inside single quotes.
6. Delete the downloaded JSON file from your Downloads folder once both places have it.

## Part 5: Get the report into the folder each morning

Whatever tool saves the report, two rules make it work:

- Save it as a PDF into the `Tijori reports` folder.
- Put the date in the file name, like `tijori-2026-11-18.pdf`.

## If something blocks you

- **"Service account key creation is disabled."** Your company's Google account has a rule against keys. Do Parts 1 to 3 with a personal Gmail account instead.
- **"Sharing outside the organisation is not allowed."** Same cause. Keep the folder in a personal Gmail account.
- **Lost the key file.** Go back to the Keys tab, delete the old key and create a new one.

## When you are done

Tell Claude the two variables are in place. The reader that picks up the PDF each morning gets built and tested after that.
