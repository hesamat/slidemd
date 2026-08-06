/**
 * Shared registry of open dropdown managers.
 *
 * Both AiDropdownManager and InsertDropdownManager register here so that
 * opening one dropdown closes all others — preventing overlapping panels
 * in the editor toolbar.
 */
export const dropdownRegistry = new Set();
