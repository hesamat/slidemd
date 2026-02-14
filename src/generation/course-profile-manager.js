/**
 * Course Profile Manager
 * Manages CRUD operations for course profiles
 * Uses File System Access API for user-selected directory storage
 */

import { Notification } from "../renderer/notification.js";

export class CourseProfileManager {
    static PROFILES_DIR_KEY = 'webdeck_profiles_directory';
    static PROFILE_EXT = '.json';
    static HANDLE_DB_NAME = 'webdeck_profiles_fs';
    static HANDLE_STORE = 'directory_handles';
    static HANDLE_KEY = 'profiles_dir';

    /**
     * Initialize the profile manager
     * Checks if a profiles directory has been selected
     * @returns {Promise<boolean>} True if initialized, false if directory not set
     */
    static async init() {
        const dirHandle = await this.restoreDirectoryHandle();
        return dirHandle !== null;
    }

    /**
     * Get the stored directory handle
     * @returns {FileSystemDirectoryHandle|null} The directory handle or null
     */
    static getDirectoryHandle() {
        return this.directoryHandle || null;
    }

    /**
     * Restore the directory handle from IndexedDB if possible
     * @returns {Promise<FileSystemDirectoryHandle|null>} Directory handle or null
     */
    static async restoreDirectoryHandle() {
        if (this.directoryHandle) return this.directoryHandle;

        const storedHandle = await this.loadDirectoryHandleFromDb();
        if (!storedHandle) return null;

        try {
            const permission = await storedHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                this.directoryHandle = storedHandle;
                return storedHandle;
            }

            if (permission === 'prompt') {
                const request = await storedHandle.requestPermission({ mode: 'readwrite' });
                if (request === 'granted') {
                    this.directoryHandle = storedHandle;
                    return storedHandle;
                }
            }
        } catch (error) {
            console.warn('Failed to restore directory handle permissions:', error);
        }

        return null;
    }

    /**
     * Prompt user to select profiles directory using File System Access API
     * @returns {Promise<FileSystemDirectoryHandle|null>} Directory handle or null if cancelled
     */
    static async selectProfilesDirectory() {
        try {
            if (!window.showDirectoryPicker) {
                Notification.error('Your browser does not support directory selection. Please use Chrome, Edge, or Opera.');
                return null;
            }

            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            await this.storeDirectoryHandle(dirHandle);
            localStorage.setItem(this.PROFILES_DIR_KEY, JSON.stringify({ name: dirHandle.name }));

            this.directoryHandle = dirHandle;
            Notification.success(`Course profiles will be stored in: ${dirHandle.name}`);

            return dirHandle;
        } catch (error) {
            if (error.name === 'AbortError') {
                return null; // User cancelled
            }
            console.error('Failed to select directory:', error);
            Notification.error('Failed to select directory: ' + error.message);
            return null;
        }
    }

    /**
     * Load all profiles from the profiles directory
     * @returns {Promise<Array<Object>>} Array of course profile objects
     */
    static async loadAllProfiles() {
        const dirHandle = this.directoryHandle || await this.restoreDirectoryHandle();
        if (!dirHandle) return []; // No directory set, return empty array without prompting

        try {
            const profiles = [];

            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith(this.PROFILE_EXT)) {
                    try {
                        const file = await entry.getFile();
                        const text = await file.text();
                        const profile = JSON.parse(text);
                        profiles.push(profile);
                    } catch (error) {
                        console.error(`Failed to load profile from ${entry.name}:`, error);
                    }
                }
            }

            // Sort by updated date (newest first)
            profiles.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

            return profiles;
        } catch (error) {
            console.error('Failed to load profiles:', error);
            Notification.error('Failed to load course profiles');
            return [];
        }
    }

    /**
     * Load a specific profile by ID
     * @param {string} profileId - The profile ID
     * @returns {Promise<Object|null>} The profile object or null if not found
     */
    static async loadProfile(profileId) {
        const dirHandle = this.directoryHandle || await this._ensureDirectory();
        if (!dirHandle) return null;

        try {
            const fileName = this.getProfileFileName(profileId);
            const fileHandle = await dirHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                const fallback = await this.findProfileInDirectory(dirHandle, profileId);
                return fallback?.profile || null;
            }
            console.error(`Failed to load profile ${profileId}:`, error);
            return null;
        }
    }

    /**
     * Save a course profile (create or update)
     * @param {Object} profile - The profile object to save
     * @returns {Promise<boolean>} Success status
     */
    static async saveProfile(profile) {
        try {
            // Validate profile
            const validation = this.validateProfile(profile);
            if (!validation.valid) {
                Notification.error('Invalid profile: ' + validation.errors.join(', '));
                return false;
            }

            // Ensure profile has required timestamps
            if (!profile.createdAt) {
                profile.createdAt = new Date().toISOString();
            }
            profile.updatedAt = new Date().toISOString();

            // Ensure profile has an ID
            if (!profile.id) {
                profile.id = this.generateId();
            }

            const fileName = this.getProfileFileName(profile.id);
            const dirHandle = this.directoryHandle || await this._ensureDirectory();

            if (dirHandle) {
                const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(profile, null, 2));
                await writable.close();

                Notification.success('Course profile saved');
                return true;
            }

            if (window.showSaveFilePicker) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{
                            description: 'JSON file',
                            accept: { 'application/json': ['.json'] },
                        }],
                    });

                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(profile, null, 2));
                    await writable.close();

                    Notification.success('Course profile saved');
                    return true;
                } catch (error) {
                    if (error.name === 'AbortError') {
                        return false; // User cancelled
                    }
                    throw error;
                }
            }

            {
                // Fallback: download as blob
                const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                Notification.success('Course profile saved');
                return true;
            }
        } catch (error) {
            console.error('Failed to save profile:', error);
            Notification.error('Failed to save profile: ' + error.message);
            return false;
        }
    }

    /**
     * Delete a course profile
     * @param {string} profileId - The profile ID to delete
     * @returns {Promise<boolean>} Success status
     */
    static async deleteProfile(profileId) {
        const dirHandle = this.directoryHandle || await this._ensureDirectory();
        if (!dirHandle) return false;

        try {
            const fileName = this.getProfileFileName(profileId);
            await dirHandle.removeEntry(fileName);
            Notification.success('Course profile deleted');
            return true;
        } catch (error) {
            if (error.name === 'NotFoundError') {
                const fallback = await this.findProfileInDirectory(dirHandle, profileId);
                if (!fallback) {
                    Notification.warning('Profile not found');
                    return false;
                }

                await dirHandle.removeEntry(fallback.fileName);
                Notification.success('Course profile deleted');
                return true;
            }
            console.error('Failed to delete profile:', error);
            Notification.error('Failed to delete profile');
            return false;
        }
    }

    /**
     * Validate a profile object
     * @param {Object} profile - The profile to validate
     * @returns {Object} { valid: boolean, errors: Array<string> }
     */
    static validateProfile(profile) {
        const errors = [];

        if (!profile) {
            return { valid: false, errors: ['Profile is required'] };
        }

        if (!profile.name || typeof profile.name !== 'string' || profile.name.trim() === '') {
            errors.push('Profile name is required');
        }

        if (profile.description && typeof profile.description !== 'string') {
            errors.push('Description must be a string');
        }

        if (!profile.learningObjectives || !Array.isArray(profile.learningObjectives)) {
            errors.push('Learning objectives must be an array');
        } else if (profile.learningObjectives.length === 0) {
            errors.push('At least one learning objective is required');
        } else {
            profile.learningObjectives.forEach((obj, i) => {
                if (typeof obj !== 'string' || obj.trim() === '') {
                    errors.push(`Learning objective ${i + 1} must be a non-empty string`);
                }
            });
        }

        if (profile.topicsCovered && typeof profile.topicsCovered !== 'string') {
            errors.push('Topics covered must be a string');
        }

        if (profile.defaultSlideCount !== undefined) {
            const count = Number(profile.defaultSlideCount);
            if (isNaN(count) || count < 1 || count > 100) {
                errors.push('Default slide count must be between 1 and 100');
            }
        }

        if (profile.aiProvider && typeof profile.aiProvider !== 'string') {
            errors.push('AI provider must be a string');
        }

        if (profile.aiModel && typeof profile.aiModel !== 'string') {
            errors.push('AI model must be a string');
        }

        if (profile.templates && typeof profile.templates !== 'object') {
            errors.push('Templates must be an object');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Generate a new profile ID (UUID v4)
     * @returns {string} UUID v4
     */
    static generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Get the file name for a profile ID
     * @param {string} profileId - The profile ID
     * @returns {string} File name
     */
    static getProfileFileName(profileId) {
        return `${profileId}${this.PROFILE_EXT}`;
    }

    /**
     * Find a profile file by ID when the filename is not based on the ID
     * @param {FileSystemDirectoryHandle} dirHandle - Directory handle
     * @param {string} profileId - Profile ID
     * @returns {Promise<{profile: Object, fileName: string} | null>} Match info or null
     */
    static async findProfileInDirectory(dirHandle, profileId) {
        try {
            for await (const entry of dirHandle.values()) {
                if (entry.kind !== 'file' || !entry.name.endsWith(this.PROFILE_EXT)) {
                    continue;
                }

                try {
                    const file = await entry.getFile();
                    const text = await file.text();
                    const profile = JSON.parse(text);
                    if (profile?.id === profileId) {
                        return { profile, fileName: entry.name };
                    }
                } catch (error) {
                    console.warn(`Failed to inspect profile file ${entry.name}:`, error);
                }
            }
        } catch (error) {
            console.warn('Failed to scan profiles directory:', error);
        }

        return null;
    }

    /**
     * Ensure a profiles directory is selected
     * @private
     * @returns {Promise<FileSystemDirectoryHandle|null>} Directory handle or null
     */
    static async _ensureDirectory() {
        let dirHandle = await this.restoreDirectoryHandle();

        if (!dirHandle) {
            // Prompt user to select directory
            dirHandle = await this.selectProfilesDirectory();
            this.directoryHandle = dirHandle;
        }

        return dirHandle;
    }

    /**
     * Store a directory handle in IndexedDB
     * @param {FileSystemDirectoryHandle} handle - Directory handle
     */
    static async storeDirectoryHandle(handle) {
        try {
            const db = await this.openDirectoryHandleDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(this.HANDLE_STORE, 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.objectStore(this.HANDLE_STORE).put(handle, this.HANDLE_KEY);
            });
        } catch (error) {
            console.warn('Failed to store directory handle:', error);
        }
    }

    /**
     * Load a directory handle from IndexedDB
     * @returns {Promise<FileSystemDirectoryHandle|null>} Directory handle or null
     */
    static async loadDirectoryHandleFromDb() {
        try {
            const db = await this.openDirectoryHandleDb();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(this.HANDLE_STORE, 'readonly');
                const request = tx.objectStore(this.HANDLE_STORE).get(this.HANDLE_KEY);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn('Failed to load directory handle:', error);
            return null;
        }
    }

    /**
     * Open the IndexedDB database for directory handles
     * @returns {Promise<IDBDatabase>} Database instance
     */
    static async openDirectoryHandleDb() {
        return await new Promise((resolve, reject) => {
            const request = indexedDB.open(this.HANDLE_DB_NAME, 1);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(this.HANDLE_STORE)) {
                    db.createObjectStore(this.HANDLE_STORE);
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Create a new profile with default values
     * @param {Object} overrides - Values to override defaults
     * @returns {Object} New profile object
     */
    static createProfile(overrides = {}) {
        return {
            id: this.generateId(),
            name: '',
            description: '',
            learningObjectives: [''],
            topicsCovered: '',
            defaultSlideCount: 15,
            includeActivities: true,
            aiProvider: 'glm', // Default to GLM
            aiModel: 'glm-5',
            templates: this.getDefaultTemplates(),
            createdAt: null, // Will be set on save
            updatedAt: null,
            ...overrides
        };
    }

    /**
     * Get default slide templates for new profiles
     * @returns {Object} Default templates
     */
    static getDefaultTemplates() {
        return {
            titleSlide: `layout: title-slide

@title

# {{topic}}

{{subtitle}}

---
`,
            lecture: `layout: {{layout}}

@main

## {{title}}

{{content}}

{{#if examples}}
### Examples

{{examples}}
{{/if}}

{{#if notes}}
<!-- notes: {{notes}} -->
{{/if}}

---
`,
            activity: `layout: two-column

@main

## Activity: {{title}}

{{instructions}}

### Task

{{task}}

@media

### Example

{{example}}

<!-- notes: {{teacherNotes}} -->

---
`,
            summary: `layout: focus

@main

## Summary

{{summary}}

### Key Takeaways

{{keyTakeaways}}

---
`
        };
    }

    /**
     * Export profile as JSON file (for backup/sharing)
     * @param {Object} profile - The profile to export
     */
    static async exportProfile(profile) {
        try {
            const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${profile.name.replace(/[^a-z0-9]/gi, '-')}-profile.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Notification.success('Profile exported');
        } catch (error) {
            console.error('Failed to export profile:', error);
            Notification.error('Failed to export profile');
        }
    }

    /**
     * Import profile from JSON file
     * @returns {Promise<Object|null>} Imported profile or null
     */
    static async importProfile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';

            // Hide the input but keep it functional
            input.style.position = 'absolute';
            input.style.left = '-9999px';
            input.style.width = '1px';
            input.style.height = '1px';
            input.style.opacity = '0';
            input.style.overflow = 'hidden';
            input.style.zIndex = '-1';

            let resolved = false;

            const cleanup = () => {
                if (input.parentNode === document.body) {
                    document.body.removeChild(input);
                }
            };

            const doResolve = (value) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(value);
                }
            };

            input.onchange = async (e) => {
                try {
                    const selectedFile = e.target.files[0];
                    if (!selectedFile) {
                        doResolve(null);
                        return;
                    }

                    const profile = await this.processImportFile(selectedFile);
                    doResolve(profile);
                } catch (error) {
                    console.error('Failed to import profile:', error);
                    Notification.error('Failed to import profile: ' + error.message);
                    doResolve(null);
                }
            };

            input.oncancel = () => {
                doResolve(null);
            };

            // Add to DOM
            document.body.appendChild(input);

            // Trigger click
            setTimeout(() => {
                input.click();
            }, 10);
        });
    }

    /**
     * Process imported profile file
     * @param {File} file - File object
     * @returns {Promise<Object|null>} Processed profile or null
     */
    static async processImportFile(file) {
        try {
            const text = await file.text();
            const profile = JSON.parse(text);

            // Validate imported profile
            const validation = this.validateProfile(profile);
            if (!validation.valid) {
                Notification.error('Invalid profile file: ' + validation.errors.join(', '));
                return null;
            }

            // Generate new ID to avoid conflicts
            profile.id = this.generateId();
            profile.createdAt = null;
            profile.updatedAt = null;

            Notification.success('Profile imported');
            return profile;
        } catch (error) {
            if (error instanceof SyntaxError) {
                Notification.error('Invalid JSON file');
            } else {
                throw error;
            }
            return null;
        }
    }
}
