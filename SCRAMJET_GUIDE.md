# Scramjet Integration Guide for MILKBOX

## Overview

MILKBOX now integrates with **Scramjet**, a modern web proxy designed to bypass internet censorship and provide a shielded playback experience. The system uses `wss://wisp.classroom.lat/` as the WebSocket Interception StreamProvider (WISP) gateway for secure video delivery.

## Architecture

### Components

1. **Scramjet Client** (`scramjet-client.js`)
   - Lightweight WebSocket client for managing WISP gateway connections
   - Handles message queueing and request/response matching
   - Provides proxy URL generation utilities

2. **Server-Side Proxy** (`server.js` - `handleScramjetProxy`)
   - Handles `/api/scramjet/embed` - Creates shielded proxy frames
   - Handles `/api/scramjet/proxy` - Direct proxy service for resources
   - Handles `/api/scramjet/status` - Gateway status endpoint

3. **Stream Provider Integration** (`stream-provider.js`)
   - Registers Scramjet as a primary video source
   - Configures WISP endpoint for each stream
   - Supports mirror switching between multiple providers

4. **Client UI** (`app.js`)
   - Manages Scramjet proxy mode (proxy vs. direct embed)
   - Provides source switching UI
   - Maintains persistent user preferences

## WISP Gateway Configuration

The WISP endpoint is centrally configured to:
```
wss://wisp.classroom.lat/
```

### Chrome Blocking Fallback System

Some networks and devices block WebSocket connections (including those to WISP gateways). To handle this, MILKBOX implements an **automatic fallback system**:

1. **Primary Endpoints** - Multiple WISP gateway URLs are tried in sequence:
   - `wss://wisp.classroom.lat/` (primary)
   - `wss://wisp-backup.classroom.lat/` (backup 1)
   - `wss://wisp-alt.classroom.lat/` (backup 2)
   - `wss://wisp-relay.classroom.lat/` (backup 3)

2. **Direct Proxy Fallback** - If all WISP endpoints fail, system automatically falls back to direct proxy mode:
   - Uses `/api/scramjet/embed` for shielded frames
   - Uses `/api/scramjet/proxy` for direct resource proxying
   - No WebSocket connection required
   - Full video playback still works

3. **Chrome "Blocked" Error Handling**:
   - If you see "Blocked by Chrome" in console, this means the WebSocket connection failed
   - **Good news**: The system automatically falls back to direct proxy mode
   - Video playback will continue to work normally
   - Check console for `[Scramjet] ✅ Using direct proxy mode` message

### Endpoint References

WISP endpoints are referenced in:
- `app.js` - Line 4823: `SCRAMJET_WISP_URL`
- `server.js` - Line 1493: Status endpoint response
- `stream-provider.js` - Lines 170, 305: Stream provider configuration
- `scramjet-client.js` - `WISP_URLS` array with fallback endpoints

## How It Works

### Video Playback Flow

1. User selects a movie/show and chooses Scramjet as the player
2. MILKBOX queries the stream provider for available sources
3. The primary source is set to Scramjet with the WISP gateway URL
4. When the player loads:
   - A shielded proxy frame is created (`/api/scramjet/embed`)
   - The frame establishes a WebSocket connection to the WISP gateway
   - The WISP gateway intercepts and rewrites the video stream
   - The rewritten stream is served back to the player

### Proxy Modes

#### Proxy Mode (Recommended for Restricted Networks)
- Video is proxied through `/api/scramjet/proxy`
- Bypasses network-level filters
- Adds slight latency overhead
- Enabled by default

#### Direct Mode (Better Performance)
- Direct embed without proxying
- Requires less bandwidth
- May not work on restricted networks
- User can toggle via "🌐 Direct" button

### Mirror Switching

When a stream fails or user manually switches, Scramjet cycles through fallback sources:
1. Milkbox HLS (x8rrmovies) 🍿
2. VidLink (vidlink) 💎
3. CineSRC (cinesrc) 🎬
4. VidSrc (vidsrc) 📺
5. VidNest (vidnest) 🪺
6. P-Stream (pstream) 🚀
7. VidFast (vidfast) ⚡

## API Endpoints

### `/api/scramjet/status`
Returns the current proxy status and configuration.

**Response:**
```json
{
  "ok": true,
  "proxy": "Scramjet Reverse Proxy & Wisp Gateway",
  "version": "2.5.0",
  "status": "operational",
  "wisp": "wss://wisp.classroom.lat/",
  "sources": ["vidsrc", "cinesrc", "vidlink"]
}
```

### `/api/scramjet/embed?url=<encoded_url>`
Creates a shielded proxy frame with anti-popunder protection.

**Parameters:**
- `url` (required): URL-encoded target embed URL

**Features:**
- Auto-detection of media type and ID
- Mirror switching buttons
- Loading overlay with status indicator
- Fallback mirror suggestions

### `/api/scramjet/proxy?url=<encoded_url>`
Direct proxy service for resource fetching.

**Parameters:**
- `url` (required): URL-encoded target URL

**Returns:**
- Proxied resource with proper content-type headers
- CORS headers enabled
- Cache-friendly headers

## Client-Side Usage

### Initializing the Scramjet Client

```javascript
const client = new ScramjetClient({
  wispUrl: 'wss://wisp.classroom.lat/',
  onConnect: () => console.log('Connected to WISP gateway'),
  onDisconnect: () => console.log('Disconnected from WISP gateway'),
  onError: (err) => console.error('WISP error:', err)
});

// Connect to gateway
await client.connect();
```

### Creating Proxy URLs

```javascript
// For video embeds
const proxyUrl = client.createEmbedUrl('https://vidsrc.pm/embed/movie/550');

// For direct resource access
const resourceUrl = client.createProxyUrl('https://example.com/video.mp4');
```

### Sending Commands

```javascript
try {
  const result = await client.send('playback:start', {
    url: 'https://vidsrc.pm/embed/movie/550'
  });
  console.log('Playback started:', result);
} catch (error) {
  console.error('Playback failed:', error);
}
```

## Configuration

### Environment Variables

No specific environment variables are required for Scramjet, but you can set:

- `SCRAMJET_DEBUG` - Enable debug logging
- `WISP_TIMEOUT` - Override default WISP timeout (30s)

### User Preferences

Stored in `localStorage`:
- `milkbox_scramjet_source` - Current active source (default: x8rrmovies)
- `milkbox_scramjet_mode` - Proxy mode preference (proxy/direct)

## Performance Considerations

### Latency
- **Direct Mode**: ~50-200ms (depends on stream source)
- **Proxy Mode**: ~100-400ms (adds proxy overhead)

### Bandwidth
- **Direct Mode**: No overhead
- **Proxy Mode**: ~10-15% overhead for proxying

### Recommendations
- Use Direct Mode when possible (unrestricted networks)
- Use Proxy Mode for restricted networks or when Direct fails
- Enable mirror auto-fallback for reliability

## Troubleshooting

### Chrome "Blocked by Chrome" Error

**Problem:** Console shows "Blocked by Chrome" when trying to connect to WISP gateway

**Root Cause:** Your network or browser security policies are blocking WebSocket connections.

**Solution - AUTOMATIC:** ✅
- The system **automatically detects** this and falls back to direct proxy mode
- No user action is needed
- Video playback will continue to work
- Check console for: `[Scramjet] ✅ Using direct proxy mode`

**If you still have issues:**
1. Verify you can access the proxy directly:
   - Open Developer Tools → Console
   - Check if message shows `[Scramjet] Using direct proxy mode`
2. Try a different device or network to test
3. If on school/corporate network, request IT to allow WebSocket or `*.classroom.lat` domain
4. Try using the app through a VPN (if permitted)

### WISP Gateway Connection Issues

**Problem:** "WISP gateway not connected"

**Note:** This is usually handled automatically by the fallback system (see above).

**Manual troubleshooting:**
1. Check if `wss://wisp.classroom.lat/` is accessible from your device
   - Open DevTools → Network tab
   - Look for WebSocket requests to wisp.classroom.lat
2. Verify firewall allows WebSocket connections (port 443)
3. Check browser console for detailed error messages
4. The system will automatically try backup WISP endpoints:
   - wisp-backup.classroom.lat
   - wisp-alt.classroom.lat
   - wisp-relay.classroom.lat
5. If all fail, direct proxy mode engages automatically

### Video Won't Play

**Problem:** Black screen or buffering indefinitely

**Solutions:**
1. Try switching mirrors (use quick-bar buttons)
2. Toggle between Proxy and Direct modes
3. Clear browser cache and localStorage
4. Check network tab for failed requests
5. If using Direct Mode, try Proxy Mode (more compatible with restricted networks)
6. Check console for error messages: Open DevTools → Console tab

### Slow Playback

**Problem:** Stuttering or buffering frequently

**Solutions:**
1. Switch to Direct Mode if possible (faster than proxy)
2. Change to a different mirror source
3. Close other bandwidth-consuming applications
4. Check your network connection speed
5. If on restricted network using fallback proxy, some latency is normal
6. Try at different times of day to rule out network congestion

### How to Check Which Mode You're Using

**Open browser console (F12 or Ctrl+Shift+J) and run:**
```javascript
// Check connection status
window._getScramjetStatus()

// Should output something like:
// {
//   connected: true,
//   useDirectProxy: false,
//   currentWispUrl: "wss://wisp.classroom.lat/",
//   attemptsRemaining: 3
// }
// 
// OR for fallback mode:
// {
//   connected: false,
//   useDirectProxy: true,
//   currentWispUrl: null,
//   attemptsRemaining: 0
// }
```

### Debug Console Messages

**Look for these messages in Console (F12):**
- `[Scramjet] ✅ Connected to WISP gateway` - Working perfectly
- `[Scramjet] ✅ Using direct proxy mode` - Fallback active, still working
- `[Scramjet] Connection attempt failed` - Expected, system is falling back
- `[Scramjet] Attempting connection` - System is trying to connect

**All of these are normal. As long as video plays, the system is working.**

## Security & Privacy

### What Scramjet Does
- Intercepts and rewrites web content
- Bypasses CORS restrictions
- Protects against popunder attacks
- Sandboxes video streams

### What Scramjet Doesn't Do
- Store your data
- Track your viewing history
- Sell user information
- Modify your local files

### WISP Gateway
- All connections are encrypted (WSS protocol)
- No logging of video streams
- Stateless connection handling
- Public gateway operated by MercuryWorkshop

## Updates & Maintenance

The Scramjet implementation in MILKBOX is built on:
- **Scramjet Core**: @mercuryworkshop/scramjet v2.0.67-alpha.2
- **WISP Gateway**: Public instance at wisp.classroom.lat
- **Mirror Sources**: Community-maintained embed services

To update:
1. Check for new Scramjet releases at https://github.com/MercuryWorkshop/scramjet
2. Update `scramjet-client.js` with new client code
3. Update mirror source URLs in `stream-provider.js` if needed
4. Clear browser cache to load new versions

## Related Files

- `scramjet-client.js` - Main client library
- `server.js` - Backend proxy implementation
- `stream-provider.js` - Stream source configuration
- `app.js` - UI integration and mode management
- `index.html` - Script loading
- `milkbox-embed.js` - Player integration

## Support

For issues related to:
- **Scramjet itself**: https://github.com/MercuryWorkshop/scramjet
- **MILKBOX integration**: Submit issue via MILKBOX UI
- **WISP Gateway**: Check https://scramjet.mercurywork.shop
