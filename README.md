# BigQuery Release Notes Explorer

A premium, responsive web application built with Python Flask and plain vanilla HTML, JavaScript, and CSS. It fetches, parses, and displays Google Cloud BigQuery Release Notes from the official feed and allows users to compose and share tweets about individual updates.

## Features

- **Dynamic Feed Parser**: Automatically fetches and parses the Atom XML feed from `https://docs.cloud.google.com/feeds/bigquery-release-notes.xml`. It splits daily entries containing multiple updates into individual cards (Features, Issues, Announcements, Deprecations, etc.) with custom visual badge categorization.
- **In-Memory Server Caching**: Caches feed details for 10 minutes to minimize network latency and prevent feed rate limits, with a force-refresh capability.
- **Glassmorphic UI**: Beautiful dark/light mode layout that respects the user's OS preference but includes an override toggle with persistence (handled using inline scripts to prevent Flash of Unstyled Content/FOUC).
- **Responsive Animations & Shimmer Skeletons**: Real-time feedback with a rotation animation on the refresh button, plus clean CSS shimmer skeleton cards while fetching data.
- **Instant Search & Category Filtering**: Filter cards instantly by category (e.g., Features, Issues) or search the text for specific keywords.
- **Interactive Tweet Composer**:
  - Automatically generates formatted tweet summaries based on selected release note details.
  - Truncates text gracefully to respect Twitter's 280-character limit (accounting for URL shortening).
  - Live character counter with an SVG progress ring.
  - Copy to Clipboard utility.
  - One-click share opening Twitter/X Web Intent.

## Project Structure

```text
bq-releases-notes/
├── app.py                  # Flask Web Application & XML Parser
├── requirements.txt        # Python dependencies
├── README.md               # Setup and documentation
├── templates/
│   └── index.html          # Semantic HTML layout
└── static/
    ├── css/
    │   └── style.css       # Custom Glassmorphism CSS & Shimmer loading styles
    └── js/
        └── app.js          # API client, live filter logic, & Tweet Composer
```

## Running the Application

### 1. Prerequisites

Make sure you have **Python 3** installed on your system.

### 2. Run the Server

From the `bq-releases-notes` directory, run the Flask server using the pre-configured virtual environment:

```bash
.venv/bin/python app.py
```

By default, the application will run locally on `http://127.0.0.1:5001`.

### 3. Open in Browser

Open your web browser and navigate to:
[http://127.0.0.1:5001](http://127.0.0.1:5001)
