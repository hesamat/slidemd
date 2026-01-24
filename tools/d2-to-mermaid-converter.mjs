/**
 * D2 to Mermaid Diagram Converter
 *
 * Converts D2 diagram syntax to Mermaid syntax.
 * Supports:
 * - Flow diagrams (direction, nodes, edges)
 * - Edge labels
 * - Node styles (colors)
 * - Basic shapes (document, hexagon, etc.)
 */

/**
 * Main conversion function
 * @param {string} d2Source - D2 diagram source code
 * @returns {string} Mermaid diagram source code
 */
export function d2ToMermaid(d2Source) {
    if (!d2Source || typeof d2Source !== 'string') {
        return '';
    }

    const lines = d2Source.split('\n').map(line => line.trimEnd()).filter(line => line.trim() !== '');
    if (lines.length === 0) {
        return '';
    }

    // Extract direction
    let direction = 'TD'; // Default
    let directionLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('direction:')) {
            const dir = line.split(':')[1]?.trim().toLowerCase();
            if (dir === 'down' || dir === 'td') {
                direction = 'TD';
            } else if (dir === 'up' || dir === 'dt') {
                direction = 'DT';
            } else if (dir === 'right' || dir === 'lr') {
                direction = 'LR';
            } else if (dir === 'left' || dir === 'rl') {
                direction = 'RL';
            }
            directionLineIndex = i;
            break;
        }
    }

    // Remove direction line from processing
    const contentLines = directionLineIndex >= 0
        ? lines.filter((_, i) => i !== directionLineIndex)
        : lines;

    // Parse nodes and edges
    const nodes = new Map();
    const edges = [];
    const styles = [];
    const subgraphs = [];

    for (const line of contentLines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('//')) {
            continue;
        }

        // Check if it's an edge (contains ->)
        if (trimmed.includes('->')) {
            const edgeResult = parseEdge(trimmed);
            if (edgeResult) {
                edges.push(edgeResult.edge);
                if (edgeResult.nodeDefs) {
                    for (const [id, def] of Object.entries(edgeResult.nodeDefs)) {
                        if (!nodes.has(id)) {
                            nodes.set(id, def);
                        }
                    }
                }
            }
            continue;
        }

        // Check if it's a node definition with shape/style
        const nodeResult = parseNode(trimmed);
        if (nodeResult) {
            if (nodeResult.type === 'node') {
                nodes.set(nodeResult.id, nodeResult);
            } else if (nodeResult.type === 'style') {
                styles.push(nodeResult);
            }
        }
    }

    // Generate Mermaid code
    let mermaid = `graph ${direction}\n`;

    // Add nodes
    for (const [id, node] of nodes) {
        if (node.mermaidId) {
            mermaid += `    ${node.mermaidId}\n`;
        }
    }

    // Add edges
    for (const edge of edges) {
        mermaid += `    ${edge}\n`;
    }

    // Add styles
    for (const style of styles) {
        mermaid += `    ${style.mermaid}\n`;
    }

    return mermaid;
}

/**
 * Parse an edge definition
 * @param {string} line - D2 edge line
 * @returns {object|null} { edge: string, nodeDefs?: object }
 */
function parseEdge(line) {
    // Edge format: A -> B : label
    // Or: A -> B
    const arrowMatch = line.match(/^([\w\s]+)\s*->\s*([\w\s]+)(?:\s*:\s*(.+))?$/);
    if (!arrowMatch) {
        return null;
    }

    const [, from, to, label] = arrowMatch;
    const fromId = sanitizeId(from.trim());
    const toId = sanitizeId(to.trim());

    const nodeDefs = {};
    nodeDefs[fromId] = { id: fromId, label: from.trim(), mermaidId: `${fromId}["${from.trim()}"]` };
    nodeDefs[toId] = { id: toId, label: to.trim(), mermaidId: `${toId}["${to.trim()}"]` };

    let edge;
    if (label) {
        edge = `${fromId} -->|${escapeMermaidText(label.trim())}| ${toId}`;
    } else {
        edge = `${fromId} --> ${toId}`;
    }

    return { edge, nodeDefs };
}

/**
 * Parse a node definition
 * @param {string} line - D2 node line
 * @returns {object|null} Node definition or style
 */
function parseNode(line) {
    // Node format: Name: Label
    // Node with shape: Name: Label { shape: document }
    // Node with style: Name: Label { style: {fill: "#color"} }

    // Check for style block (standalone style)
    const styleMatch = line.match(/^([\w\s]+)\s*\{\s*style:\s*\{([^}]+)\}\s*\}$/);
    if (styleMatch) {
        const [, id, styleContent] = styleMatch;
        const styleProps = parseStyleProperties(styleContent);
        return {
            type: 'style',
            id: sanitizeId(id.trim()),
            mermaid: `style ${sanitizeId(id.trim())} ${styleProps}`
        };
    }

    // Node with properties
    const nodeWithPropsMatch = line.match(/^([\w\s]+):\s*(.+?)\s*\{\s*(.+?)\s*\}$/);
    if (nodeWithPropsMatch) {
        const [, id, label, props] = nodeWithPropsMatch;
        const sanitizedId = sanitizeId(id.trim());
        const nodeLabel = label.trim().replace(/\\n/g, '<br/>');

        // Parse properties
        const propObj = parseProperties(props);

        // Determine shape syntax
        let mermaidId;
        if (propObj.shape === 'document') {
            mermaidId = `${sanitizedId}[["${escapeMermaidText(nodeLabel)}"]]`;
        } else if (propObj.shape === 'hexagon') {
            mermaidId = `${sanitizedId}[/"${escapeMermaidText(nodeLabel)}"/]`;
        } else if (propObj.shape === 'cylinder') {
            mermaidId = `${sanitizedId}[("${escapeMermaidText(nodeLabel)}")]`;
        } else if (propObj.shape === 'circle') {
            mermaidId = `${sanitizedId}(("${escapeMermaidText(nodeLabel)}"))`;
        } else if (propObj.shape === 'diamond') {
            mermaidId = `${sanitizedId}{"${escapeMermaidText(nodeLabel)}"}`;
        } else if (propObj.shape === 'rect') {
            mermaidId = `${sanitizedId}["${escapeMermaidText(nodeLabel)}"]`;
        } else {
            mermaidId = `${sanitizedId}["${escapeMermaidText(nodeLabel)}"]`;
        }

        return {
            type: 'node',
            id: sanitizedId,
            label: nodeLabel,
            mermaidId
        };
    }

    // Simple node format: Name: Label
    const simpleNodeMatch = line.match(/^([\w\s]+):\s*(.+)$/);
    if (simpleNodeMatch) {
        const [, id, label] = simpleNodeMatch;
        const sanitizedId = sanitizeId(id.trim());
        const nodeLabel = label.trim().replace(/\\n/g, '<br/>');
        return {
            type: 'node',
            id: sanitizedId,
            label: nodeLabel,
            mermaidId: `${sanitizedId}["${escapeMermaidText(nodeLabel)}"]`
        };
    }

    return null;
}

/**
 * Parse properties from D2 syntax
 * @param {string} propsString - Properties string
 * @returns {object} Parsed properties
 */
function parseProperties(propsString) {
    const props = {};
    // Remove outer braces if present
    const cleaned = propsString.replace(/^\{|\}$/g, '').trim();

    // Match key: value pairs
    const pairs = cleaned.match(/(\w+):\s*([^,]+)/g);
    if (pairs) {
        for (const pair of pairs) {
            const [key, ...valueParts] = pair.split(':');
            const value = valueParts.join(':').trim();
            props[key.trim()] = value.replace(/['"]/g, '').trim();
        }
    }

    return props;
}

/**
 * Parse style properties for Mermaid
 * @param {string} styleContent - Style content string
 * @returns {string} Mermaid style string
 */
function parseStyleProperties(styleContent) {
    const props = [];

    // Match fill: "#color"
    const fillMatch = styleContent.match(/fill:\s*["']?([^"'\s,}]+)["']?/);
    if (fillMatch) {
        props.push(`fill:${fillMatch[1]}`);
    }

    // Match stroke: "#color"
    const strokeMatch = styleContent.match(/stroke:\s*["']?([^"'\s,}]+)["']?/);
    if (strokeMatch) {
        props.push(`stroke:${strokeMatch[1]}`);
    }

    // Match stroke-width: number
    const strokeWidthMatch = styleContent.match(/stroke-width:\s*(\d+)/);
    if (strokeWidthMatch) {
        props.push(`stroke-width:${strokeWidthMatch[1]}px`);
    }

    return props.join(', ') || 'fill:#fff,stroke:#333';
}

/**
 * Sanitize ID for Mermaid
 * @param {string} id - Original ID
 * @returns {string} Sanitized ID
 */
function sanitizeId(id) {
    // Remove spaces and special characters, keep alphanumeric
    return id.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Escape text for Mermaid labels
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMermaidText(text) {
    // Escape quotes and special characters
    return text
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Convert a markdown file containing D2 diagrams to Mermaid
 * @param {string} markdown - Markdown content
 * @returns {string} Markdown with Mermaid diagrams
 */
export function convertMarkdownFile(markdown) {
    // Replace ```d2 code blocks with ```mermaid
    let result = markdown.replace(/```d2\n([\s\S]*?)```/g, (match, d2Source) => {
        const mermaidSource = d2ToMermaid(d2Source);
        return '```mermaid\n' + mermaidSource + '```';
    });

    // Also handle ~~~d2 variant
    result = result.replace(/~~~d2\n([\s\S]*?)~~~/g, (match, d2Source) => {
        const mermaidSource = d2ToMermaid(d2Source);
        return '~~~mermaid\n' + mermaidSource + '~~~';
    });

    return result;
}

/**
 * CLI entry point for file conversion
 * @param {string[]} args - Command line arguments
 */
export async function main(args) {
    const inputFile = args[0];
    const outputFile = args[1];

    if (!inputFile) {
        console.error('Usage: d2-to-mermaid-converter.mjs <input-file> [output-file]');
        process.exit(1);
    }

    const fs = await import('fs');
    const path = await import('path');

    try {
        let input = await fs.promises.readFile(inputFile, 'utf-8');
        const converted = convertMarkdownFile(input);

        if (outputFile) {
            await fs.promises.writeFile(outputFile, converted, 'utf-8');
            console.log(`Converted ${inputFile} -> ${outputFile}`);
        } else {
            console.log(converted);
        }
    } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    await main(process.argv.slice(2));
}
