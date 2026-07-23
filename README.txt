🧩 Chrome Extension – User Interaction & Network Logger

A Chrome Extension that captures and records user interactions, network calls, and console logs — ideal for debugging, testing, or monitoring web sessions.

🚀 Features
🖱️ 1. User Interaction Tracking
Automatically captures screenshots when the extension starts.
Highlights all user clicks within the page for clear visibility.

🌐 2. Network Activity Capture
Records all network calls triggered by user interactions.
Each network call is stored as an individual JSON file in the following format:
{
  "url": "",
  "method": "GET",
  "statusCode": 0,
  "requestBody": "",
  "responseBody": ""
}

🧾 3. Console Log Collection
Captures complete console logs, including:
Errors
Warnings
Info / Debug messages
🔍 4. Network Call Filters
Allows users to apply filters to record only specific network calls.
Filters can be based on keywords, endpoints, or domains entered by the user.

💾 5. Data Export
On clicking the Download button, the extension generates and downloads a ZIP file containing:
📁 network/ → JSON files of all recorded network calls
📁 screenshots/ → Screenshot JSON files with highlighted clicks
📄 console.txt → Consolidated console logs

🧩 Installation & Setup
Follow these steps to load the extension locally in Chrome:
Download this repository.
Open Google Chrome and go to:
chrome://extensions/
Enable Developer mode (top-right corner).
Click "Load unpacked".
Select the folder containing the extension files (where manifest.json is located).
The extension will appear in your Chrome toolbar — click its icon to start monitoring!

🧠 Use Cases
QA automation and bug reproduction
API testing and monitoring
Frontend performance tracking
Session replay for debugging UI issues