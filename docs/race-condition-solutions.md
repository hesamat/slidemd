# Race Condition Solutions: Presenter-Viewer Deck Data Synchronization

## Problem Statement

There's a race condition between the presenter broadcasting deck data and the viewer waiting for it. If the viewer window loads after the presenter has already completed initialization and broadcast the deck data, the viewer will timeout waiting for data that was already sent.

**Current Implementation:**
- **Presenter** (deck.js:142-144): Broadcasts deck data once after initialization
- **Viewer** (deck.js:90-92): Waits for broadcast with 5-second timeout

## Alternative Solutions

### 1. Periodic Re-broadcast

**Description:** The presenter continuously broadcasts deck data every N seconds (e.g., 2-3 seconds).

**Pros:**
- ✅ **Simple to implement** - Only requires adding a `setInterval` in the presenter
- ✅ **Works for viewers that open at any time** - Late-opening viewers will receive data within N seconds
- ✅ **No changes needed to viewer logic** - Viewer continues to wait for broadcast as it does now
- ✅ **Handles presenter tab crashes** - If presenter recovers, broadcasting resumes

**Cons:**
- ❌ **Continuous network overhead** - Wastes bandwidth broadcasting when no viewers are listening
- ❌ **Battery drain on mobile devices** - Constant broadcasts consume device resources
- ❌ **Memory overhead** - Serializing and sending large deck objects repeatedly
- ❌ **Increased CPU usage** - Unnecessary work when deck hasn't changed
- ❌ **No acknowledgment** - Presenter doesn't know if viewers received the data

**Implementation Complexity:** Low (5-10 lines of code)

**Best For:** Small decks, infrequent viewer window creation, development/debugging

---

### 2. Request-Response Pattern

**Description:** Viewers send a "request-deck" message when they load. The presenter listens for these requests and responds with the deck data.

**Pros:**
- ✅ **No unnecessary broadcasts** - Data only sent when explicitly requested
- ✅ **Most reliable** - Guaranteed delivery to viewers that request it
- ✅ **No timing issues** - Works regardless of load order
- ✅ **Efficient** - Minimal network overhead (only when needed)
- ✅ **Scalable** - Works with any number of viewers
- ✅ **Can include acknowledgment** - Viewer can confirm receipt

**Cons:**
- ❌ **Requires presenter to listen** - Presenter must maintain an active listener
- ❌ **More code changes** - Both presenter and viewer logic need updates
- ❌ **No data if presenter closed** - If presenter window closes, viewers can't get data
- ❌ **Slightly slower for fast-opening viewers** - Extra round-trip delay (request → response)

**Implementation Complexity:** Medium (20-30 lines of code)

**Best For:** Production use cases, multiple viewers, large decks, reliability-critical scenarios

---

### 3. Hybrid Approach (Initial Broadcast + Re-broadcast on Request)

**Description:** Presenter broadcasts once on load, then listens for viewer requests and responds to each. Viewers first try to receive the initial broadcast, then fall back to requesting if timeout occurs.

**Pros:**
- ✅ **Best of both worlds** - Fast for early viewers, reliable for late viewers
- ✅ **Optimized for common case** - Viewers that open quickly get data immediately
- ✅ **No continuous overhead** - Only broadcasts when needed
- ✅ **Handles all timing scenarios** - Works regardless of load order
- ✅ **Graceful degradation** - Falls back to request if initial broadcast missed

**Cons:**
- ❌ **Most complex implementation** - Requires coordinating multiple communication patterns
- ❌ **More code to maintain** - Both broadcast and request-response logic needed
- ❌ **Potential for duplicate sends** - Viewer might receive both broadcast and response
- ❌ **Requires timeout tuning** - Need to balance initial wait vs. fallback timing

**Implementation Complexity:** Medium-High (40-50 lines of code)

**Best For:** Production use with optimal performance requirements, variable network conditions

---

### 4. SharedWorker or Service Worker

**Description:** Use a SharedWorker to hold deck data in memory, accessible by all windows. The presenter updates the shared worker, and viewers read from it.

**Pros:**
- ✅ **True shared state** - Single source of truth across all windows
- ✅ **No timing issues** - Data always available when viewers load
- ✅ **Efficient** - No repeated serialization or network messages
- ✅ **Persistent across reloads** - Data survives page refreshes (Service Worker)
- ✅ **Supports complex scenarios** - Can handle multiple presenters, viewers

**Cons:**
- ❌ **High complexity** - Requires understanding of Worker APIs and lifecycle
- ❌ **Browser compatibility** - SharedWorker not supported in all browsers (notably Safari)
- ❌ **Debugging difficulty** - Workers run in separate contexts, harder to debug
- ❌ **Requires build configuration** - May need special bundler setup for workers
- ❌ **More moving parts** - Worker lifecycle, messaging protocol, error handling
- ❌ **Security considerations** - Workers have different security contexts

**Implementation Complexity:** High (100+ lines of code, plus worker file)

**Best For:** Advanced use cases, enterprise applications, when offline support needed

---

### 5. Storage Fallback (localStorage/IndexedDB)

**Description:** The presenter writes deck data to localStorage or IndexedDB. If broadcast fails, the viewer falls back to reading from shared storage.

**Pros:**
- ✅ **Simple and reliable** - Storage APIs are well-supported and stable
- ✅ **No timing issues** - Data persists and is always available
- ✅ **Works across sessions** - Data survives browser restarts
- ✅ **Backward compatible** - Can coexist with existing broadcast approach
- ✅ **Easy to debug** - Can inspect storage in DevTools
- ✅ **No continuous overhead** - Only writes when deck changes

**Cons:**
- ❌ **Storage limits** - localStorage limited to ~5-10MB, may not fit large decks
- ❌ **Synchronous API (localStorage)** - Can block main thread with large data
- ❌ **Cross-origin restrictions** - Only works if windows share same origin
- ❌ **Storage pollution** - Old deck data may persist if not cleaned up
- ❌ **Privacy considerations** - Data persists in browser storage
- ❌ **Serialization overhead** - Must stringify/parse large objects

**Implementation Complexity:** Low-Medium (15-25 lines of code)

**Best For:** Fallback mechanism, moderate deck sizes, same-origin windows

---

## Recommendation Matrix

| Criterion | Periodic | Request-Response | Hybrid | SharedWorker | Storage Fallback |
|-----------|----------|------------------|--------|--------------|------------------|
| **Reliability** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Performance** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Simplicity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ |
| **Battery Friendly** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Browser Compat** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |

## Recommended Approach

**For immediate fix:** **Option 5 (Storage Fallback)** combined with current broadcast

This provides:
- Quick implementation (1-2 hours)
- High reliability
- Minimal code changes
- Backward compatibility

**For long-term solution:** **Option 3 (Hybrid Approach)**

This provides:
- Optimal performance
- Maximum reliability
- Best user experience
- Professional polish

## Implementation Priority

1. **Phase 1 (Quick Fix):** Add storage fallback to current broadcast
   - Presenter writes to localStorage on deck load/change
   - Viewer tries broadcast first, falls back to localStorage
   - Estimated effort: 2-3 hours

2. **Phase 2 (Optimization):** Implement request-response pattern
   - Replace broadcast-only with request-response
   - Keep storage fallback as safety net
   - Estimated effort: 4-6 hours

3. **Phase 3 (Future):** Consider SharedWorker for advanced features
   - Only if offline support or complex sync needed
   - Estimated effort: 1-2 days

## Code Snippets

### Option 5: Storage Fallback (Quick Fix)

**Presenter (deck.js):**
```javascript
// After line 143
if (!isViewer) {
    controller.reloadManager.broadcastDeckData(deck);
    // Add storage fallback
    try {
        localStorage.setItem('webdeck_viewer_data', JSON.stringify(deck));
        localStorage.setItem('webdeck_viewer_data_timestamp', Date.now().toString());
    } catch (e) {
        console.warn('Failed to store deck data:', e);
    }
}
```

**Viewer (DeckLoader.loadDeckDataFromBroadcast):**
```javascript
static loadDeckDataFromBroadcast(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const channel = new BroadcastChannel("webdeck-deck");
        const timeout = setTimeout(() => {
            channel.close();
            // Fallback to localStorage
            try {
                const stored = localStorage.getItem('webdeck_viewer_data');
                if (stored) {
                    const deck = JSON.parse(stored);
                    console.log('Loaded deck from storage fallback');
                    resolve(deck);
                    return;
                }
            } catch (e) {
                console.error('Storage fallback failed:', e);
            }
            reject(new Error("Timeout waiting for deck data. Make sure presenter window is open."));
        }, timeoutMs);
        channel.onmessage = (ev) => {
            if (ev.data?.type === "deck") {
                clearTimeout(timeout);
                channel.close();
                resolve(ev.data.deck);
            }
        };
    });
}
```

### Option 3: Hybrid Approach (Recommended Long-term)

**Presenter:**
```javascript
// In ReloadManager or deck.js initialization
static initPresenterDeckBroadcast(deck) {
    // Initial broadcast
    const channel = new BroadcastChannel("webdeck-deck");
    channel.postMessage({ type: "deck", deck });
    
    // Listen for requests
    channel.onmessage = (ev) => {
        if (ev.data?.type === "request-deck") {
            channel.postMessage({ type: "deck", deck });
        }
    };
    
    // Keep channel open to handle requests
    return channel;
}
```

**Viewer:**
```javascript
static loadDeckDataFromBroadcast(timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const channel = new BroadcastChannel("webdeck-deck");
        let resolved = false;
        
        const timeout = setTimeout(() => {
            if (!resolved) {
                // Fallback: request deck data
                channel.postMessage({ type: "request-deck" });
                
                // Give presenter time to respond
                setTimeout(() => {
                    if (!resolved) {
                        channel.close();
                        reject(new Error("No response from presenter window"));
                    }
                }, 3000);
            }
        }, timeoutMs);
        
        channel.onmessage = (ev) => {
            if (ev.data?.type === "deck" && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                channel.close();
                resolve(ev.data.deck);
            }
        };
    });
}
```
