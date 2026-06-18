import time
import logging
import requests
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from flask import Flask, render_template, jsonify, request

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Simple in-memory cache
FEED_CACHE = {
    "data": None,
    "last_updated": 0,
    "ttl": 600  # 10 minutes cache
}

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def parse_html_content(content_html):
    """
    Parses the HTML content of a feed entry and splits it by <h3>/<h4> headers.
    This separates daily releases into individual updates.
    """
    if not content_html:
        return []
    
    soup = BeautifulSoup(content_html, 'html.parser')
    # Google release notes generally use h3 for update type badges like "Feature", "Announcement", etc.
    headers = soup.find_all(['h2', 'h3', 'h4'])
    
    updates = []
    
    if not headers:
        # If there are no headers, treat the entire block as a general update
        text_content = soup.get_text().strip()
        updates.append({
            'type': 'Update',
            'html': content_html,
            'text': text_content
        })
        return updates
        
    for i, header in enumerate(headers):
        update_type = header.get_text().strip()
        
        # Collect all sibling nodes until the next header
        sibling_html = []
        curr = header.next_sibling
        while curr and curr.name not in ['h2', 'h3', 'h4']:
            sibling_html.append(str(curr))
            curr = curr.next_sibling
            
        html_part = "".join(sibling_html).strip()
        text_part = BeautifulSoup(html_part, 'html.parser').get_text().strip()
        
        # Determine standard category/severity for styling
        category = 'info'
        type_lower = update_type.lower()
        if 'feature' in type_lower or 'new' in type_lower:
            category = 'feature'
        elif 'issue' in type_lower or 'bug' in type_lower or 'broken' in type_lower:
            category = 'issue'
        elif 'deprecation' in type_lower or 'deprecated' in type_lower:
            category = 'deprecation'
        elif 'announcement' in type_lower or 'notice' in type_lower:
            category = 'announcement'
        elif 'changed' in type_lower or 'update' in type_lower:
            category = 'changed'
            
        updates.append({
            'type': update_type,
            'category': category,
            'html': html_part,
            'text': text_part
        })
        
    return updates

def fetch_and_parse_feed():
    """
    Fetches the BigQuery XML feed and parses it into a list of structured release notes.
    """
    logger.info("Fetching fresh release notes feed from Google Cloud...")
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    response = requests.get(FEED_URL, headers=headers, timeout=15)
    response.raise_for_status()
    
    root = ET.fromstring(response.content)
    namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries = []
    
    for entry in root.findall('atom:entry', namespaces):
        title = entry.find('atom:title', namespaces)
        entry_id = entry.find('atom:id', namespaces)
        updated = entry.find('atom:updated', namespaces)
        link = entry.find('atom:link', namespaces)
        content = entry.find('atom:content', namespaces)
        
        title_text = title.text.strip() if title is not None else "Unknown Date"
        id_text = entry_id.text.strip() if entry_id is not None else ""
        updated_text = updated.text.strip() if updated is not None else ""
        link_href = link.attrib.get('href', '') if link is not None else "https://cloud.google.com/bigquery/docs/release-notes"
        content_html = content.text if content is not None else ""
        
        updates = parse_html_content(content_html)
        
        entries.append({
            'date': title_text,
            'id': id_text,
            'updated': updated_text,
            'link': link_href,
            'updates': updates
        })
        
    return entries

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', '').lower() == 'true'
    current_time = time.time()
    
    # Check cache validity
    if not force_refresh and FEED_CACHE["data"] and (current_time - FEED_CACHE["last_updated"] < FEED_CACHE["ttl"]):
        logger.info("Serving release notes from memory cache.")
        return jsonify({
            "source": "cache",
            "last_updated": FEED_CACHE["last_updated"],
            "releases": FEED_CACHE["data"]
        })
    
    try:
        data = fetch_and_parse_feed()
        FEED_CACHE["data"] = data
        FEED_CACHE["last_updated"] = current_time
        return jsonify({
            "source": "live",
            "last_updated": current_time,
            "releases": data
        })
    except Exception as e:
        logger.error(f"Failed to fetch or parse release notes: {e}")
        
        # Fallback to cache if available even if expired
        if FEED_CACHE["data"]:
            logger.warning("Serving stale cache data due to live fetch failure.")
            return jsonify({
                "source": "stale_cache",
                "last_updated": FEED_CACHE["last_updated"],
                "releases": FEED_CACHE["data"],
                "error": str(e)
            }), 200
            
        return jsonify({
            "error": "Failed to retrieve release notes",
            "details": str(e)
        }), 500

if __name__ == '__main__':
    # Run the server locally on port 5002
    app.run(debug=True, port=5002)
