import gspread
import pandas as pd
import json
from pathlib import Path

# Load service account credentials from file
with open("backend/chatbot-495005-773642ee4209.json", "r", encoding="utf-8") as f:
    creds = json.load(f)

# Replace with your Google Sheet URL or key
SHEET_URL = "<PASTE_YOUR_SHEET_URL_HERE>"

# Extract key from URL if needed
def extract_sheet_key(url):
    import re
    if "/spreadsheets/d/" in url:
        match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url)
        if match:
            return match.group(1)
        raise ValueError("Could not parse Google Sheet key from URL.")
    return url.strip()

key = extract_sheet_key(SHEET_URL)

client = gspread.service_account_from_dict(creds)
book = client.open_by_key(key)
sheet = book.sheet1
rows = sheet.get_all_records()
df = pd.DataFrame(rows)
print(f"Loaded rows: {len(df)}")
print(df.head())
