/* ========================================
   Mini IDE - Application Logic
   Puter.js + Claude Opus 4.5 Integration
   ======================================== */

// ========================================
// Global State
// ========================================

const state = {
    files: new Map(), // path -> { name, content, type }
    fileTree: null,
    activeFile: null,
    openTabs: [],
    editor: null,
    chatHistory: [],
    isProcessing: false
};

// ========================================
// Monaco Editor Setup
// ========================================

// Configure Monaco loader
require.config({
    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
});

// Language detection based on file extension
const languageMap = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'rb': 'ruby',
    'php': 'php',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'swift': 'swift',
    'kt': 'kotlin',
    'sql': 'sql',
    'sh': 'shell',
    'bash': 'shell',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'svg': 'xml'
};

function getLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return languageMap[ext] || 'plaintext';
}

// Initialize Monaco Editor
function initEditor() {
    return new Promise((resolve) => {
        require(['vs/editor/editor.main'], function () {
            // Define custom dark theme
            monaco.editor.defineTheme('miniide-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '6e7681', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'ff7b72' },
                    { token: 'string', foreground: 'a5d6ff' },
                    { token: 'number', foreground: '79c0ff' },
                    { token: 'function', foreground: 'd2a8ff' },
                    { token: 'variable', foreground: 'ffa657' },
                    { token: 'type', foreground: '7ee787' }
                ],
                colors: {
                    'editor.background': '#0d1117',
                    'editor.foreground': '#f0f6fc',
                    'editor.lineHighlightBackground': '#161b2280',
                    'editor.selectionBackground': '#388bfd40',
                    'editorCursor.foreground': '#58a6ff',
                    'editorLineNumber.foreground': '#6e7681',
                    'editorLineNumber.activeForeground': '#f0f6fc',
                    'editor.inactiveSelectionBackground': '#388bfd20'
                }
            });

            // Create editor instance
            const container = document.getElementById('monacoEditor');
            container.innerHTML = ''; // Clear placeholder

            state.editor = monaco.editor.create(container, {
                value: '',
                language: 'javascript',
                theme: 'miniide-dark',
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                lineNumbers: 'on',
                minimap: { enabled: true, scale: 1 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                padding: { top: 16, bottom: 16 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderLineHighlight: 'all',
                bracketPairColorization: { enabled: true }
            });

            // Track content changes
            state.editor.onDidChangeModelContent(() => {
                if (state.activeFile) {
                    const file = state.files.get(state.activeFile);
                    if (file) {
                        file.content = state.editor.getValue();
                        file.modified = true;
                        updateTabState(state.activeFile, true);
                    }
                }
            });

            resolve(state.editor);
        });
    });
}

// ========================================
// File Management
// ========================================

// Handle folder upload
async function handleFolderUpload(event) {
    const files = event.target.files;
    if (!files.length) return;

    state.files.clear();
    state.openTabs = [];
    state.activeFile = null;

    // Process all files
    const readPromises = [];

    for (const file of files) {
        const path = file.webkitRelativePath || file.name;

        // Skip hidden files and common ignore patterns
        if (shouldIgnoreFile(path)) continue;

        readPromises.push(readFileContent(file, path));
    }

    await Promise.all(readPromises);

    // Build and render file tree
    buildFileTree();
    renderFileTree();

    // Update UI
    document.querySelector('.empty-state')?.remove();
    updateFileCountIndicator();
}

function shouldIgnoreFile(path) {
    const ignorePatterns = [
        /^\./,
        /node_modules/,
        /\.git/,
        /\.DS_Store/,
        /thumbs\.db/i,
        /\.pyc$/,
        /__pycache__/
    ];

    return ignorePatterns.some(pattern => pattern.test(path));
}

async function readFileContent(file, path) {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            state.files.set(path, {
                name: file.name,
                path: path,
                content: e.target.result,
                type: file.type || 'text/plain',
                modified: false
            });
            resolve();
        };

        reader.onerror = () => resolve(); // Skip files that can't be read

        // Only read text files
        if (isTextFile(file.name)) {
            reader.readAsText(file);
        } else {
            state.files.set(path, {
                name: file.name,
                path: path,
                content: '[Binary file]',
                type: file.type,
                modified: false,
                binary: true
            });
            resolve();
        }
    });
}

function isTextFile(filename) {
    const textExtensions = [
        'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'less',
        'json', 'md', 'txt', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h',
        'cs', 'go', 'rs', 'swift', 'kt', 'sql', 'sh', 'bash', 'yaml', 'yml',
        'xml', 'svg', 'env', 'gitignore', 'dockerignore', 'editorconfig',
        'prettierrc', 'eslintrc', 'babelrc', 'vue', 'svelte'
    ];

    const ext = filename.split('.').pop().toLowerCase();
    const baseName = filename.toLowerCase();

    return textExtensions.includes(ext) ||
        textExtensions.some(e => baseName.endsWith(e)) ||
        !filename.includes('.'); // Files without extension (like Makefile)
}

// Build hierarchical file tree from flat file map
function buildFileTree() {
    const root = { name: 'root', children: {}, isDirectory: true };

    for (const [path] of state.files) {
        const parts = path.split('/');
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;

            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    path: parts.slice(0, i + 1).join('/'),
                    children: isFile ? null : {},
                    isDirectory: !isFile
                };
            }

            current = current.children[part];
        }
    }

    state.fileTree = root;
}

// Render file tree in explorer panel
function renderFileTree() {
    const container = document.getElementById('fileTree');
    container.innerHTML = '';

    if (!state.fileTree || Object.keys(state.fileTree.children).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <p>Upload a folder to get started</p>
                <button class="btn btn-primary" onclick="document.getElementById('folderInput').click()">
                    Upload Folder
                </button>
            </div>
        `;
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'file-tree';

    // Sort: directories first, then alphabetically
    const sortedChildren = Object.values(state.fileTree.children).sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    for (const child of sortedChildren) {
        ul.appendChild(createTreeItem(child));
    }

    container.appendChild(ul);
}

function createTreeItem(node) {
    const li = document.createElement('li');
    li.className = 'tree-item';

    const content = document.createElement('div');
    content.className = 'tree-item-content';

    if (node.isDirectory) {
        li.classList.add('collapsed');

        content.innerHTML = `
            <svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="file-name">${escapeHtml(node.name)}</span>
        `;

        content.addEventListener('click', () => {
            li.classList.toggle('collapsed');
        });

        // Create children container
        const childrenUl = document.createElement('ul');
        childrenUl.className = 'tree-children';

        const sortedChildren = Object.values(node.children).sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        for (const child of sortedChildren) {
            childrenUl.appendChild(createTreeItem(child));
        }

        li.appendChild(content);
        li.appendChild(childrenUl);
    } else {
        content.innerHTML = `
            <svg class="file-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span class="file-name">${escapeHtml(node.name)}</span>
        `;

        content.addEventListener('click', () => openFile(node.path));
        li.appendChild(content);
    }

    return li;
}

// ========================================
// Editor Tab Management
// ========================================

function openFile(path) {
    const file = state.files.get(path);
    if (!file) return;

    // Check if file is binary
    if (file.binary) {
        alert('Cannot open binary file in editor');
        return;
    }

    // Add to tabs if not already open
    if (!state.openTabs.includes(path)) {
        state.openTabs.push(path);
        renderTabs();
    }

    // Set as active
    state.activeFile = path;
    updateActiveTab();

    // Update editor content
    const language = getLanguage(file.name);
    monaco.editor.setModelLanguage(state.editor.getModel(), language);
    state.editor.setValue(file.content);

    // Update file indicator in chat
    updateCurrentFileIndicator();

    // Update tree selection
    updateTreeSelection(path);
}

function renderTabs() {
    const container = document.getElementById('editorTabs');
    container.innerHTML = '';

    for (const path of state.openTabs) {
        const file = state.files.get(path);
        if (!file) continue;

        const tab = document.createElement('button');
        tab.className = 'tab';
        tab.dataset.path = path;

        if (file.modified) {
            tab.classList.add('modified');
        }

        tab.innerHTML = `
            <span class="tab-name">${escapeHtml(file.name)}</span>
            <span class="close-btn" title="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </span>
        `;

        tab.addEventListener('click', (e) => {
            if (e.target.closest('.close-btn')) {
                closeTab(path);
            } else {
                openFile(path);
            }
        });

        container.appendChild(tab);
    }

    updateActiveTab();
}

function closeTab(path) {
    const index = state.openTabs.indexOf(path);
    if (index === -1) return;

    state.openTabs.splice(index, 1);

    // If closing active tab, switch to another
    if (state.activeFile === path) {
        if (state.openTabs.length > 0) {
            const newIndex = Math.min(index, state.openTabs.length - 1);
            openFile(state.openTabs[newIndex]);
        } else {
            state.activeFile = null;
            state.editor.setValue('');
            updateCurrentFileIndicator();
            showEditorPlaceholder();
        }
    }

    renderTabs();
}

function updateActiveTab() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.path === state.activeFile);
    });
}

function updateTabState(path, modified) {
    const tab = document.querySelector(`.tab[data-path="${CSS.escape(path)}"]`);
    if (tab) {
        tab.classList.toggle('modified', modified);
    }
}

function updateTreeSelection(path) {
    document.querySelectorAll('.tree-item-content.active').forEach(el => {
        el.classList.remove('active');
    });

    // Find and highlight the selected file
    const items = document.querySelectorAll('.tree-item-content');
    items.forEach(item => {
        const nameEl = item.querySelector('.file-name');
        if (nameEl && path.endsWith(nameEl.textContent)) {
            item.classList.add('active');
        }
    });
}

// Update file count indicator in chat panel
function updateFileCountIndicator() {
    const indicator = document.getElementById('projectFilesIndicator');
    const countText = document.getElementById('fileCountText');

    if (!indicator || !countText) return;

    const fileCount = state.files.size;

    if (fileCount > 0) {
        indicator.style.display = 'flex';
        countText.textContent = `${fileCount} file${fileCount === 1 ? '' : 's'} loaded - AI can modify any`;
    } else {
        indicator.style.display = 'none';
    }
}

function showEditorPlaceholder() {
    const container = document.getElementById('monacoEditor');
    // Monaco editor is already there, just clear content
}

// ========================================
// AI Chat Integration
// ========================================

const SYSTEM_PROMPT = `You are an AI coding assistant integrated into a code editor IDE. You have access to ALL files in the user's project.

CRITICAL RULES FOR CODE MODIFICATIONS:
1. When modifying code, you MUST specify which file you're changing
2. Use this EXACT format for each file change:

### FILE: [exact filename with extension]
\`\`\`[language]
[complete file content]
\`\`\`

3. You can modify MULTIPLE files in one response - just repeat the format above
4. ALWAYS provide the COMPLETE file content, not just snippets
5. Auto-detect which file(s) need to be changed based on the user's request
6. If adding a new file, use: ### NEW FILE: [filename]
7. Be smart about which files to modify - analyze the full project structure

Example response format:
"I'll add animations to your page. Here are the changes:

### FILE: styles.css
\`\`\`css
/* complete CSS content with animations */
\`\`\`

### FILE: App.jsx
\`\`\`jsx
/* complete JSX content with animation classes */
\`\`\`"

Current context: The user has uploaded a project folder. You can see all their files below.`;

// Build context with ALL project files (optimized to prevent timeout)
function buildProjectContext() {
    let context = "=== PROJECT FILES ===\n\n";
    const MAX_FILE_SIZE = 5000; // Truncate large files to prevent timeout

    for (const [path, file] of state.files) {
        if (file.binary) continue;
        const lang = getLanguage(file.name);
        let content = file.content;

        // Truncate very large files
        if (content.length > MAX_FILE_SIZE) {
            content = content.substring(0, MAX_FILE_SIZE) + '\n... [truncated for brevity]';
        }

        context += `--- ${path} ---\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
    }

    return context;
}

// Parse AI response to extract file changes
function parseFileChanges(response) {
    const changes = [];

    // Match both "### FILE:" and "### NEW FILE:" patterns
    const filePattern = /###\s*(?:NEW\s+)?FILE:\s*([^\n]+)\s*\n```(\w+)?\n([\s\S]*?)```/gi;
    let match;

    while ((match = filePattern.exec(response)) !== null) {
        const filename = match[1].trim();
        const language = match[2] || 'plaintext';
        const content = match[3].trim();

        changes.push({
            filename,
            language,
            content,
            isNew: match[0].toLowerCase().includes('new file')
        });
    }

    return changes;
}

// Find the file path that matches a filename
function findFilePath(filename) {
    // Try exact match first
    for (const [path] of state.files) {
        if (path === filename || path.endsWith('/' + filename) || path.endsWith('\\' + filename)) {
            return path;
        }
    }

    // Try matching just the filename
    for (const [path, file] of state.files) {
        if (file.name === filename) {
            return path;
        }
    }

    return null;
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message || state.isProcessing) return;

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    updateSendButton();

    // Add user message to chat
    addMessageToChat('user', message);

    // Check if we have any files loaded
    if (state.files.size === 0) {
        addMessageToChat('assistant', "Please upload a folder first so I can see your project files and help you modify them.");
        return;
    }

    // Show typing indicator
    showTypingIndicator();

    state.isProcessing = true;

    try {
        // Build full project context
        const projectContext = buildProjectContext();
        const userRequest = `USER REQUEST: ${message}`;

        // Build message history (simplified to reduce payload)
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: projectContext + '\n\n' + userRequest }
        ];

        console.log('Sending request to Claude Opus 4.5...');
        console.log('Context size:', projectContext.length, 'characters');

        // Call Claude via Puter.js (non-streaming for reliability)
        const response = await puter.ai.chat(messages, {
            model: 'claude-opus-4-5'
        });

        // Remove typing indicator
        hideTypingIndicator();

        console.log('Response received:', response);

        // Get response text
        let fullResponse = '';
        if (typeof response === 'string') {
            fullResponse = response;
        } else if (response?.message?.content) {
            fullResponse = response.message.content;
        } else if (response?.text) {
            fullResponse = response.text;
        } else if (response?.content) {
            fullResponse = response.content;
        } else {
            fullResponse = JSON.stringify(response);
        }

        // Add response to chat
        const messageEl = addMessageToChat('assistant', fullResponse);
        const bubbleEl = messageEl.querySelector('.message-bubble');

        // Add to history
        state.chatHistory.push({ role: 'user', content: message });
        state.chatHistory.push({ role: 'assistant', content: fullResponse });

        // Parse and add apply buttons for each file change
        const fileChanges = parseFileChanges(fullResponse);

        if (fileChanges.length > 0) {
            addMultiFileApplyButtons(bubbleEl, fileChanges);
        }

    } catch (error) {
        hideTypingIndicator();
        console.error('AI Error:', error);

        let errorMessage = `Sorry, I encountered an error: ${error.message}`;
        if (error.message?.includes('timeout')) {
            errorMessage = "The request timed out. Please try again with a simpler request.";
        } else if (!window.puter) {
            errorMessage = "Puter.js is not loaded. Please refresh the page.";
        } else if (error.message?.includes('auth') || error.message?.includes('login')) {
            errorMessage = "Please sign in to Puter to use the AI features. Click anywhere and a login popup should appear.";
        }

        addMessageToChat('assistant', errorMessage);
    }

    state.isProcessing = false;
}

// Add apply buttons for multiple file changes
function addMultiFileApplyButtons(bubbleEl, fileChanges) {
    const container = document.createElement('div');
    container.className = 'apply-buttons-container';
    container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;';

    // Add "Apply All" button if multiple changes
    if (fileChanges.length > 1) {
        const applyAllBtn = document.createElement('button');
        applyAllBtn.className = 'apply-code-btn';
        applyAllBtn.style.background = 'var(--accent-purple)';
        applyAllBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Apply All (${fileChanges.length} files)
        `;

        applyAllBtn.addEventListener('click', () => {
            fileChanges.forEach(change => applyFileChange(change));
            applyAllBtn.innerHTML = `✓ Applied All!`;
            applyAllBtn.disabled = true;
            applyAllBtn.style.background = 'var(--text-muted)';

            // Disable individual buttons
            container.querySelectorAll('.apply-code-btn').forEach(btn => {
                btn.disabled = true;
                btn.style.background = 'var(--text-muted)';
            });
        });

        container.appendChild(applyAllBtn);
    }

    // Add individual buttons for each file
    fileChanges.forEach(change => {
        const btn = document.createElement('button');
        btn.className = 'apply-code-btn';
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Apply ${change.filename}
        `;

        btn.addEventListener('click', () => {
            applyFileChange(change);
            btn.innerHTML = `✓ ${change.filename}`;
            btn.disabled = true;
            btn.style.background = 'var(--text-muted)';
        });

        container.appendChild(btn);
    });

    bubbleEl.appendChild(container);
}

// Apply a single file change
function applyFileChange(change) {
    const { filename, content, isNew } = change;

    // Find or create the file
    let filePath = findFilePath(filename);

    if (!filePath && isNew) {
        // Create new file - use first folder as base
        const firstPath = state.files.keys().next().value;
        const basePath = firstPath ? firstPath.split('/')[0] + '/' : '';
        filePath = basePath + filename;
    }

    if (!filePath) {
        // Try to match by just filename
        filePath = filename;
    }

    // Update or create the file
    const existingFile = state.files.get(filePath);

    if (existingFile) {
        existingFile.content = content;
        existingFile.modified = true;
    } else {
        // Create new file entry
        state.files.set(filePath, {
            name: filename,
            path: filePath,
            content: content,
            type: 'text/plain',
            modified: true,
            binary: false
        });

        // Rebuild and render file tree
        buildFileTree();
        renderFileTree();
    }

    // If this file is currently open, update the editor
    if (state.activeFile === filePath) {
        state.editor.setValue(content);
    }

    // Open the file in editor
    openFile(filePath);
    updateTabState(filePath, true);
}

function addMessageToChat(role, content, streaming = false) {
    const container = document.getElementById('chatMessages');

    // Remove welcome message on first real message
    const welcome = container.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const message = document.createElement('div');
    message.className = `message ${role}`;

    const avatarContent = role === 'user' ? 'U' :
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
        </svg>`;

    message.innerHTML = `
        <div class="message-avatar">${avatarContent}</div>
        <div class="message-bubble">${streaming ? '' : formatMessage(content)}</div>
    `;

    container.appendChild(message);
    scrollChatToBottom();

    return message;
}

function formatMessage(text) {
    // Convert markdown code blocks to HTML
    let formatted = text;

    // Code blocks with language
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
}

function addApplyButton(bubbleEl, response) {
    // Extract code from response
    const codeMatch = response.match(/```(\w+)?\n([\s\S]*?)```/);
    if (!codeMatch) return;

    const code = codeMatch[2].trim();

    const btn = document.createElement('button');
    btn.className = 'apply-code-btn';
    btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Apply Changes
    `;

    btn.addEventListener('click', () => {
        applyCodeChanges(code);
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Applied!
        `;
        btn.disabled = true;
        btn.style.background = 'var(--text-muted)';
    });

    bubbleEl.appendChild(btn);
}

function applyCodeChanges(code) {
    if (!state.activeFile || !state.editor) return;

    // Update editor content
    state.editor.setValue(code);

    // Update file state
    const file = state.files.get(state.activeFile);
    if (file) {
        file.content = code;
        file.modified = true;
        updateTabState(state.activeFile, true);
    }
}

function showTypingIndicator() {
    const container = document.getElementById('chatMessages');

    const indicator = document.createElement('div');
    indicator.className = 'message assistant typing';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
        <div class="message-avatar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
            </svg>
        </div>
        <div class="message-bubble">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    container.appendChild(indicator);
    scrollChatToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

function scrollChatToBottom() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

// ========================================
// UI Utilities
// ========================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateSendButton() {
    const input = document.getElementById('chatInput');
    const btn = document.getElementById('sendBtn');
    btn.disabled = !input.value.trim() || state.isProcessing;
}

// ========================================
// Event Listeners & Initialization
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Monaco Editor
    await initEditor();

    // File upload handlers
    const uploadBtn = document.getElementById('uploadBtn');
    const emptyUploadBtn = document.getElementById('emptyUploadBtn');
    const folderInput = document.getElementById('folderInput');

    uploadBtn.addEventListener('click', () => folderInput.click());
    emptyUploadBtn?.addEventListener('click', () => folderInput.click());
    folderInput.addEventListener('change', handleFolderUpload);

    // Chat input handlers
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');

    chatInput.addEventListener('input', () => {
        // Auto-resize textarea
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
        updateSendButton();
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);

    // Drag and drop support
    const fileExplorer = document.querySelector('.file-explorer');

    fileExplorer.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileExplorer.classList.add('drag-over');
    });

    fileExplorer.addEventListener('dragleave', () => {
        fileExplorer.classList.remove('drag-over');
    });

    fileExplorer.addEventListener('drop', async (e) => {
        e.preventDefault();
        fileExplorer.classList.remove('drag-over');

        const items = e.dataTransfer.items;
        if (!items) return;

        // Note: webkitGetAsEntry is needed for folder support
        const entries = [];
        for (const item of items) {
            const entry = item.webkitGetAsEntry?.();
            if (entry) entries.push(entry);
        }

        if (entries.length > 0) {
            await processEntries(entries);
        }
    });

    console.log('Mini IDE initialized successfully!');
});

// Process drag-and-drop entries
async function processEntries(entries) {
    state.files.clear();
    state.openTabs = [];
    state.activeFile = null;

    const processEntry = async (entry, path = '') => {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file(async (file) => {
                    const fullPath = path + file.name;
                    if (!shouldIgnoreFile(fullPath)) {
                        await readFileContent(file, fullPath);
                    }
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await new Promise((resolve) => {
                reader.readEntries(resolve);
            });

            for (const childEntry of entries) {
                await processEntry(childEntry, path + entry.name + '/');
            }
        }
    };

    for (const entry of entries) {
        await processEntry(entry);
    }

    buildFileTree();
    renderFileTree();
}
