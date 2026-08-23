/**
 * SoloKanban Application State Store & Adaptive Presence Tracker
 */

export class AppState {
  constructor() {
    this.fsAdapter = null;
    this.db = null;
    this.preferencesManager = null;
    
    this.currentView = 'workspace'; // 'workspace' | 'project'
    this.currentProjectId = null;
    
    this.activeCard = null; // Currently open card in modal
    this.activeModal = null; // 'card' | 'settings' | 'merge' | null
    
    this.filterSearch = '';
    this.filterLabel = null;
    this.filterAssignee = null;
    this.filterType = null;
    this.filterPriority = null;

    // Presence tracking
    this.actorId = `human-${Math.random().toString(36).substring(2, 9)}`;
    this.actorType = 'human';
    this.activePresenceMap = new Map(); // cardId -> Array<{ actor, actorType, intent, heartbeatAt }>
    
    this.lastUserActivityTime = Date.now();
    this.presenceHeartbeatTimer = null;
    this.isUserActive = true;
  }

  initActivityListeners() {
    if (typeof window === 'undefined') return;

    const resetActivity = () => {
      this.lastUserActivityTime = Date.now();
      if (!this.isUserActive) {
        this.isUserActive = true;
        this.startPresenceHeartbeat(); // Switch back to active 15s/30s policy
      }
    };

    window.addEventListener('mousemove', resetActivity);
    window.addEventListener('keydown', resetActivity);
    window.addEventListener('click', resetActivity);
  }

  /**
   * Adaptive presence heartbeat scheduler per PRD §6.2
   * Active: 15s interval, 30s TTL
   * Idle (>30s no activity): 60s interval, 120s TTL
   */
  startPresenceHeartbeat() {
    if (this.presenceHeartbeatTimer) {
      clearInterval(this.presenceHeartbeatTimer);
    }

    const runHeartbeat = async () => {
      const idleTimeMs = Date.now() - this.lastUserActivityTime;
      const isIdle = idleTimeMs > 30000;

      if (isIdle && this.isUserActive) {
        this.isUserActive = false;
        // Re-run with 60s interval
        clearInterval(this.presenceHeartbeatTimer);
        this.presenceHeartbeatTimer = setInterval(runHeartbeat, 60000);
      }

      if (this.activeCard && this.fsAdapter) {
        await this.writePresence(this.activeCard.id, 'editing', isIdle ? 120 : 30);
      }

      await this.scanAllPresence();
    };

    const intervalMs = this.isUserActive ? 15000 : 60000;
    this.presenceHeartbeatTimer = setInterval(runHeartbeat, intervalMs);
  }

  async writePresence(cardId, intent = 'editing', ttlSeconds = 30) {
    if (!this.fsAdapter || !cardId) return;
    const presencePath = `.solokanban/presence/${cardId}/${this.actorId}.json`;
    const presenceData = {
      cardId,
      actor: this.actorId,
      actorType: this.actorType,
      intent,
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      ttlSeconds
    };
    try {
      await this.fsAdapter.writeFile(presencePath, JSON.stringify(presenceData, null, 2));
    } catch (e) {}
  }

  async clearPresence(cardId) {
    if (!this.fsAdapter || !cardId) return;
    const presencePath = `.solokanban/presence/${cardId}/${this.actorId}.json`;
    try {
      await this.fsAdapter.deleteFile(presencePath);
    } catch (e) {}
  }

  /**
   * Scans presence folder and returns active non-expired presence records per card.
   */
  async scanAllPresence() {
    if (!this.fsAdapter) return new Map();

    const presenceMap = new Map();
    const cardDirs = await this.fsAdapter.listDirectories('.solokanban/presence');

    for (const cardId of cardDirs) {
      const actorFiles = await this.fsAdapter.listFiles(`.solokanban/presence/${cardId}`);
      const activeActors = [];

      for (const file of actorFiles) {
        if (file.endsWith('.json')) {
          const content = await this.fsAdapter.readFile(`.solokanban/presence/${cardId}/${file}`);
          if (content) {
            try {
              const data = JSON.parse(content);
              const heartbeatTime = new Date(data.heartbeatAt).getTime();
              const ttlMs = (data.ttlSeconds || 30) * 1000;
              const isExpired = Date.now() - heartbeatTime > ttlMs;

              if (!isExpired && data.actor !== this.actorId) {
                activeActors.push(data);
              }
            } catch (e) {}
          }
        }
      }

      if (activeActors.length > 0) {
        presenceMap.set(cardId, activeActors);
      }
    }

    this.activePresenceMap = presenceMap;
    return presenceMap;
  }
}
