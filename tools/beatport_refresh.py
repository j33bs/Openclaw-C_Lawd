#!/usr/bin/env python3
import json
import requests
from bs4 import BeautifulSoup
import re
import os
import sys

# Target URL for Psy-Trance Top 100
URL = "https://www.beatport.com/genre/psy-trance/14/top-100"
JSON_PATH = os.path.expanduser("~/Desktop/beatport_psy_flow.json")

def fetch_beatport_tracks(limit=20):
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    response = requests.get(URL, headers=headers)
    if response.status_code != 200:
        raise Exception(f"Failed to fetch Beatport: {response.status_code}")
    
    soup = BeautifulSoup(response.text, 'html.parser')
    tracks = []
    
    # Updated selector for Beatport track cards (inspect current site; fallback to general)
    track_elements = soup.find_all('div', class_='track-item') or soup.find_all('li', class_='track') or soup.find_all('div', attrs={'data-track-id': True})[:limit]
    
    for elem in track_elements:
        try:
            # Common selectors
            title_elem = elem.find('h3') or elem.find('a', title=True) or elem.find('span', class_='title')
            artist_elem = elem.find('span', class_='artist') or elem.find('p', class_='artist')
            release_elem = elem.find('span', class_='release') or elem.find('small')
            duration_elem = elem.find('span', class_='duration') or elem.find('time')
            url_elem = elem.find('a', href=True)
            
            if title_elem and artist_elem:
                title = title_elem.get_text(strip=True)
                artist = artist_elem.get_text(strip=True)
                album = release_elem.get_text(strip=True) if release_elem else "Unknown Album"
                duration = duration_elem.get_text(strip=True) if duration_elem else "0:00"
                beatport_url = url_elem['href'] if url_elem else ""
                
                # Apple Music search URL as fallback
                apple_music_url = f"https://music.apple.com/search?term={title.replace(' ', '+')}+{artist.replace(' ', '+')}"
                
                tracks.append({
                    "title": title,
                    "artist": artist,
                    "album": album,
                    "genre": "Psy-Trance",
                    "duration": duration,
                    "appleMusicUrl": apple_music_url
                })
        except Exception as e:
            print(f"Error parsing track: {e}", file=sys.stderr)
            continue
    
    return {"tracks": tracks}

def update_json(data):
    with open(JSON_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Updated {len(data['tracks'])} tracks in {JSON_PATH}")

if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    try:
        data = fetch_beatport_tracks(limit)
        update_json(data)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)