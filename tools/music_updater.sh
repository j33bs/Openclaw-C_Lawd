#!/bin/bash

JSON_PATH="$HOME/Desktop/beatport_psy_flow.json"
PLAYLIST_NAME="Beatport Psy Flow"

if [ ! -f "$JSON_PATH" ]; then
  echo "JSON not found"
  exit 1
fi

# Create/clear playlist
osascript -e 'tell application \"Music\" to activate'
osascript -e 'tell application \"Music\" to if not (exists user playlist \"Beatport Psy Flow\") then make new user playlist with properties {name:\"Beatport Psy Flow\"}'
osascript -e 'tell application \"Music\" to set targetPlaylist to user playlist \"Beatport Psy Flow\"'
osascript -e 'tell application \"Music\" to delete every track of user playlist \"Beatport Psy Flow\"'

# Simple loop without jq for basic parse (fallback if jq missing)
tracks=$(grep -o '"title":"[^"]*"' "$JSON_PATH" | cut -d'"' -f4)
artists=$(grep -o '"artist":"[^"]*"' "$JSON_PATH" | cut -d'"' -f4)
appleUrls=$(grep -o '"appleMusicUrl":"[^"]*"' "$JSON_PATH" | cut -d'"' -f4)

i=1
while IFS= read -r title && IFS= read -r artist && IFS= read -r appleUrl; do
  if [ -n "$title" ] && [ -n "$artist" ]; then
    # Search and add
    osascript <<EOF
tell application "Music"
  set searchResults to search for "$title $artist"
  if (count of searchResults) > 0 then
    set foundTrack to item 1 of searchResults
    duplicate foundTrack to user playlist "$PLAYLIST_NAME"
  end if
end tell
EOF
    if [ "$appleUrl" != "null" ] && [ -n "$appleUrl" ]; then
      open "$appleUrl"
    fi
  fi
  i=$((i+1))
  if [ $i -gt 20 ]; then break; fi
done < <(printf '%s\n%s\n%s\n' "$tracks" "$artists" "$appleUrls" | paste - - -)

echo "Updated. Check Music and open tabs."
