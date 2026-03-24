#!/usr/bin/osascript

property jsonPath : "~/Desktop/beatport_psy_flow.json"
property playlistName : "Beatport Psy Flow"

tell application "Music"
    activate
    
    -- Create playlist if not exists
    if not (exists user playlist playlistName) then
        make new user playlist with properties {name:playlistName}
    end if
    set targetPlaylist to user playlist playlistName
    
    -- Clear existing tracks
    delete every track of targetPlaylist
    
    -- Read JSON
    set jsonStr to do shell script "cat " & quoted form of jsonPath
    set trackJsons to do shell script "echo " & quoted form of jsonStr & " | jq -c '.tracks[]' 2>/dev/null"
    
    if trackJsons is "" then
        display dialog "No tracks in JSON or jq failed."
        return
    end if
    
    set trackLines to paragraphs of trackJsons
    
    repeat with trackLine in trackLines
        if trackLine is not "" then
            set title to do shell script "echo " & quoted form of trackLine & " | jq -r '.title' 2>/dev/null"
            set artist to do shell script "echo " & quoted form of trackLine & " | jq -r '.artist' 2>/dev/null"
            set appleUrl to do shell script "echo " & quoted form of trackLine & " | jq -r '.appleMusicUrl' 2>/dev/null"
            
            if title is not "" and artist is not "" then
                set searchQuery to title & " " & artist
                set searchResults to search for searchQuery
                
                if (count of searchResults) > 0 then
                    set foundTrack to first item of searchResults
                    if artist is in (name of artist of foundTrack) then
                        duplicate foundTrack to targetPlaylist
                    else if appleUrl is not "null" and appleUrl is not "" then
                        do shell script "open " & quoted form of appleUrl
                    end if
                else if appleUrl is not "null" and appleUrl is not "" then
                    do shell script "open " & quoted form of appleUrl
                end if
            end if
        end if
    end repeat
    
    display notification "Playlist updated." with title playlistName
end tell