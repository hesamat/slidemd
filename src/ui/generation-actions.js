/**
 * Generation Actions
 * UI action handlers for generation features
 * Attached to buttons in element-gatherer.js
 */

export class GenerationActions {
  static controller = null;

  /**
   * Initialize generation actions
   * @param {Object} genController - Generation controller instance
   */
  static init(genController) {
    this.controller = genController;

    // Course Profiles menu
    this.controller.elements.menuCourseProfilesBtn?.addEventListener("click", () => {
      this.handleCourseProfiles();
    });

    // AI Config menu
    this.controller.elements.menuAIConfigBtn?.addEventListener("click", () => {
      this.handleAIConfig();
    });

    // Generate Deck menu
    this.controller.elements.menuGenerateDeckBtn?.addEventListener("click", () => {
      this.handleGenerateDeck();
    });
  }

  /**
   * Handle "Course Profiles" menu click
   */
  static async handleCourseProfiles() {
    if (!this.controller) {
      console.error("Generation controller not initialized");
      return;
    }

    try {
      await this.controller.showProfileManager();
    } catch (error) {
      console.error("Failed to open course profiles:", error);
    }
  }

  /**
   * Handle "AI Configuration" menu click
   */
  static async handleAIConfig() {
    if (!this.controller) {
      console.error("Generation controller not initialized");
      return;
    }

    try {
      await this.controller.showAIConfig();
    } catch (error) {
      console.error("Failed to open AI config:", error);
    }
  }

  /**
   * Handle "Generate Deck" menu click
   */
  static async handleGenerateDeck() {
    if (!this.controller) {
      console.error("Generation controller not initialized");
      return;
    }

    try {
      await this.controller.startGeneration();
    } catch (error) {
      console.error("Failed to start generation:", error);
    }
  }
}
