/**
 * ZIT Header Web Component
 * 用法: <zit-header active-page="index"></zit-header>
 * 可选属性:
 *   - active-page: 当前页面标识 (index|gallery|history-gallery|model-evaluate)
 *   - border-class: nav 的 border 样式类，默认 "border-slate-200 dark:border-slate-700"
 *   - nav-transition: nav 的 transition 类，默认 "transition-colors duration-300"
 *
 * 子元素会被插入到 nav 内部的 #headerExtra 容器中（如 history-gallery 的面包屑）
 */
class ZitHeader extends HTMLElement {
    connectedCallback() {
        const activePage = this.getAttribute('active-page') || '';
        const borderClass = this.getAttribute('border-class') || 'border-slate-200 dark:border-slate-700';
        const navTransition = this.getAttribute('nav-transition') || 'transition-colors duration-300';

        // 保存现有子元素（用于如 history-gallery 的面包屑等额外内容）
        const children = Array.from(this.children);

        this.innerHTML = `
            <!-- 移动端抽屉遮罩 -->
            <div id="mobileDrawerOverlay" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 hidden transition-opacity duration-300 opacity-0" onclick="closeMobileDrawer()"></div>

            <!-- 移动端左侧抽屉 -->
            <div id="mobileDrawer" class="fixed top-0 left-0 h-full w-72 bg-white dark:bg-slate-800 shadow-2xl z-50 transform -translate-x-full transition-transform duration-300 ease-in-out flex flex-col">
                <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                        </div>
                        <div>
                            <h2 class="text-lg font-bold text-slate-800 dark:text-slate-200">ZIT</h2>
                        </div>
                    </div>
                    <button onclick="closeMobileDrawer()" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <svg class="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div class="flex-1 p-4 space-y-2">
                    <a href="/" data-page="index" class="mobile-nav-tab flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-l-4 border-transparent">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                        <span class="font-medium">控制台</span>
                    </a>
                    <a href="/gallery" data-page="gallery" class="mobile-nav-tab flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-l-4 border-transparent">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                        </svg>
                        <span class="font-medium">实时相册</span>
                    </a>
                    <a href="/history-gallery" data-page="history-gallery" class="mobile-nav-tab flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-l-4 border-transparent">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                        </svg>
                        <span class="font-medium">历史相册</span>
                    </a>
                    <a href="/model-evaluate" data-page="model-evaluate" class="mobile-nav-tab flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-l-4 border-transparent">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m6 0a2 2 0 002-2v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z"></path>
                        </svg>
                        <span class="font-medium">模型测评</span>
                    </a>
                </div>
                <div class="p-4 border-t border-slate-200 dark:border-slate-700">
                    <button onclick="toggleTheme(); closeMobileDrawer();" class="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        <svg class="w-5 h-5 text-amber-500 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
                        </svg>
                        <svg class="w-5 h-5 text-slate-600 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
                        </svg>
                        <span class="font-medium text-slate-600 dark:text-slate-400">切换主题</span>
                    </button>
                </div>
            </div>

            <!-- 顶部导航栏 -->
            <nav class="sticky top-0 z-30 glass border-b ${borderClass} ${navTransition}">
                <div id="navContainer" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between items-center h-16">
                        <!-- 左侧：汉堡按钮 + Logo -->
                        <div class="flex items-center space-x-3">
                            <button onclick="openMobileDrawer()" class="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="打开菜单">
                                <svg class="w-6 h-6 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </button>
                            <a href="/" class="flex items-center space-x-3">
                                <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30">
                                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                    </svg>
                                </div>
                                <div class="hidden sm:block">
                                    <h1 class="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">ZIT 控制台</h1>
                                    <p class="text-xs text-slate-500 dark:text-slate-400">AI 图像生成工作站</p>
                                </div>
                            </a>
                        </div>

                        <!-- 右侧：导航tab + 主题切换按钮 -->
                        <div class="flex items-center space-x-2">
                            <!-- 中间：导航tab（桌面端显示） -->
                            <div class="hidden lg:flex items-center space-x-1">
                                <a href="/" data-page="index" class="nav-tab flex items-center space-x-2 px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 text-sm font-medium">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                    </svg>
                                    <span>控制台</span>
                                </a>
                                <a href="/gallery" data-page="gallery" class="nav-tab flex items-center space-x-2 px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 text-sm font-medium">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                                    </svg>
                                    <span>实时相册</span>
                                </a>
                                <a href="/history-gallery" data-page="history-gallery" class="nav-tab flex items-center space-x-2 px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 text-sm font-medium">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                                    </svg>
                                    <span>历史相册</span>
                                </a>
                                <a href="/model-evaluate" data-page="model-evaluate" class="nav-tab flex items-center space-x-2 px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 text-sm font-medium">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m6 0a2 2 0 002-2v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z"></path>
                                    </svg>
                                    <span>模型测评</span>
                                </a>
                            </div>

                            <!-- 最右侧：主题切换按钮 -->
                            <button onclick="toggleTheme()" class="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 group" title="切换主题">
                                <svg class="w-5 h-5 text-amber-500 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
                                </svg>
                                <svg class="w-5 h-5 text-slate-600 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                ${children.length > 0 ? '<div id="headerExtra" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"></div>' : ''}
            </nav>
        `;

        // 移动子元素到 nav 内部的 slot
        if (children.length > 0) {
            const slot = this.querySelector('#headerExtra');
            if (slot) {
                children.forEach(child => slot.appendChild(child));
            }
        }

        // 高亮当前页
        this.highlightActivePage(activePage);
    }

    highlightActivePage(page) {
        if (!page) return;
        this.querySelectorAll('.nav-tab').forEach(tab => {
            const tabPage = tab.getAttribute('data-page');
            if (tabPage === page) {
                tab.classList.add('bg-primary-600', 'text-white', 'hover:bg-primary-700');
                tab.classList.remove('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-700');
            }
        });
        this.querySelectorAll('.mobile-nav-tab').forEach(tab => {
            const tabPage = tab.getAttribute('data-page');
            if (tabPage === page) {
                tab.classList.add('bg-primary-50', 'dark:bg-primary-900/30', 'text-primary-700', 'dark:text-primary-400', 'border-l-4', 'border-primary-500');
                tab.classList.remove('text-slate-600', 'dark:text-slate-400', 'border-l-4', 'border-transparent');
            }
        });
    }
}

customElements.define('zit-header', ZitHeader);
