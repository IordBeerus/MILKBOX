# 🔴 LIVE TV Feature Guide

## Overview

MILKBOX includes a **LIVE TV** section for browsing IPTV channels from around the world. Channel availability and playback depend on the upstream sources.

## Features

### 📺 What's Included
- Live channels from multiple countries
- **Smart Filtering** by country and category
- **Search Functionality** to find specific channels
- **Direct Streaming** with embedded video player
- **Responsive Design** for desktop, tablet, and mobile
- IPTV-ORG's worldwide playlist, with channel logos and categories where available

### 🎯 Categories Supported
- News
- Sports
- Entertainment
- Music
- Kids
- Movies
- Documentary
- Religious
- Other

## How to Use

### Accessing LIVE TV

1. **From Main Navigation**
   - Click on the dropdown menu in the top-left
   - Select "🔴 LIVE TV" from the list

2. **From Mobile Bottom Bar**
   - Tap the "LIVE TV" button in the mobile navigation

3. **From Desktop Navigation**
   - Use the main menu dropdown to select LIVE TV

### Finding Channels

#### By Country
1. Use the "All Countries" dropdown filter
2. Select your desired country
3. Channels from that country will load automatically

#### By Category
1. Use the "All Categories" dropdown filter
2. Choose from: News, Sports, Entertainment, Music, Kids, Movies, Documentary, Religious
3. Only channels in that category will be displayed

#### By Search
1. Type in the search box at the top
2. Search by channel name, category, or country
3. Results update in real-time

### Watching Channels

1. **Browse Channels** - Scroll through the channel grid
2. **Click a Channel Card** - Click the "▶ WATCH LIVE" button
3. **Full Player Opens** - A dedicated player modal appears
4. **Stream Begins** - The channel stream starts playing
5. **Controls** - Use standard video player controls:
   - Play/Pause
   - Volume control
   - Fullscreen mode

### Player Features

- **Live Indicator** - Red "🔴 LIVE" badge shows active streams
- **Channel Info** - Displays channel name, category, and country
- **Error Handling** - Graceful error messages if stream unavailable
- **Fallback Logos** - Beautiful TV icon if channel logo fails to load
- **Auto-Play** - Video automatically starts playing when opened

## Technical Details

### Data Sources

LIVE TV streams come from the **IPTV-ORG** project:
- `iptv-org/iptv` - Public worldwide M3U playlist
- Only HTTPS stream URLs are included
- Playlist contents and individual streams may change or become unavailable

### Supported Stream Formats
- **HLS** (.m3u8) - Recommended for best compatibility
- **Direct Stream** (HTTP/HTTPS)
- **HLS.js** library for adaptive bitrate streaming

### Channel Information
Each channel includes:
- Channel name
- Logo/thumbnail
- Category classification
- Country of origin
- Stream URL

### Redundancy & Fallbacks

The player reports unavailable streams and uses a connection timeout. Try a different channel if a stream fails.

## File Structure

### New Files Added
- **`/live-tv.js`** - Core LIVE TV functionality
  - Channel loading and parsing
  - M3U playlist parsing
  - Filtering and search logic
  - Player initialization and control

### Modified Files
- **`/index.html`** - Added LIVE TV UI elements
  - Navigation links (desktop & mobile)
  - Mobile tab button
  - LIVE TV section container
  - Player modal container

- **`/app.js`** - Section management
  - Added LIVE TV to section switching logic
  - Display/hide handling for LIVE TV section

- **`/styles.css`** - Visual styling
  - LIVE TV card styles
  - Player modal styling
  - Responsive design rules
  - Hover effects and transitions

## Browser Compatibility

### Fully Supported
- ✅ Chrome/Chromium 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

### Requires HLS Support
- HLS.js polyfill included for browsers without native support
- Some streams may require specific browser capabilities

### Mobile Support
- ✅ iOS Safari 14+
- ✅ Android Chrome
- ✅ Android Firefox
- ✅ Edge Mobile

## API & Data Flow

### Initialization Flow
```
Page Load
  ↓
live-tv.js Loads
  ↓
initializeLiveTV() Called
  ↓
loadLiveTvChannels()
  └→ Fetch IPTV-ORG's worldwide playlist
  ↓
parseM3UContent() - Extract channel info
  ↓
setupLiveTvUI() - Populate filters
  ↓
renderLiveTvChannels() - Display channels
```

### Playback Flow
```
User Clicks "WATCH LIVE"
  ↓
playLiveChannel(channel)
  ↓
showLiveTvPlayer(channel)
  ↓
Create/Show Player Modal
  ↓
Set Video Source
  ↓
Attempt Playback
  ├→ Success: Stream plays
  └→ Error: Show error message
```

## Performance Optimizations

1. **Single Playlist** - Channel metadata is loaded from one worldwide playlist
2. **Debounced Search** - 300ms delay prevents excessive filtering
3. **Limited Display** - Shows the first 200 matching channels to reduce DOM size
4. **Caching** - Channel data stored in memory
5. **Filtering** - Use country, category, or search to narrow the results

## Troubleshooting

### Channels Not Loading
- Check internet connection
- Try refreshing the page
- Some sources may be temporarily unavailable
- Try different country filter

### Stream Won't Play
- Channel may be offline or blocked
- Some streams require VPN or specific region access
- Try another channel from same country
- Check browser compatibility

### Player Crashes
- Try clearing browser cache
- Disable browser extensions
- Try different browser
- Check browser console for errors

### Slow Performance
- Reduce number of visible channels
- Use more specific filters
- Close other browser tabs
- Check internet speed

## API Reference

### Main Functions

#### `initializeLiveTV()`
Initializes the LIVE TV system when page loads.

#### `loadLiveTvChannels()`
Fetches and parses channel data from all IPTV sources.

#### `setupLiveTvUI()`
Populates filter dropdowns and sets up event listeners.

#### `filterLiveTvChannels()`
Filters channels based on current filter/search values.

#### `renderLiveTvChannels()`
Renders the filtered channel grid.

#### `playLiveChannel(channel)`
Initiates playback of selected channel.

#### `showLiveTvPlayer(channel)`
Creates and displays the video player modal.

### Data Structure

```javascript
channel = {
  name: "Channel Name",           // string
  logo: "https://...",            // string (URL or null)
  category: "Sports",             // string
  country: "United States",       // string
  url: "https://stream.url...",   // string (stream URL)
  tvgName: "tvg-name-value"       // string (optional)
}
```

## Future Enhancements

Potential features for future versions:
- [ ] Channel favorites/bookmarks
- [ ] Watch history for live channels
- [ ] EPG (Electronic Program Guide)
- [ ] Multi-language support
- [ ] Subtitle/CC support
- [ ] Quality selection for streams
- [ ] Picture-in-picture mode
- [ ] Scheduled recording alerts
- [ ] Channel recommendations
- [ ] Custom channel playlists

## Credits

### Data Source
- [IPTV-ORG Project](https://github.com/iptv-org/iptv) - Public IPTV playlists

### Libraries Used
- [HLS.js](https://github.com/video-js/hls.js) - HTTP Live Streaming support
- Native HTML5 Video API

## License

This LIVE TV feature is integrated into MILKBOX and follows the same license as the main project. See LICENSE file for details.

## Support

For issues or suggestions:
1. Check this guide for solutions
2. Review browser console for errors
3. Report issues to the project repository
4. Include browser version and error messages

---

**Last Updated:** November 12, 2026
**Version:** 1.0
**Status:** Fully Functional ✅
