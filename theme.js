// Theme Management
class ThemeManager {
    constructor() {
        this.STORAGE_KEY = 'coopcerto-theme';
        this.DARK_CLASS = 'dark';
        this.init();
    }

    init() {
        // Detecta preferência do sistema se nada for salvo
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
        
        if (shouldBeDark) {
            this.setDarkMode(true);
        }

        // Observa mudanças no tema do sistema
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(this.STORAGE_KEY)) {
                this.setDarkMode(e.matches);
            }
        });

        // Setup do botão de toggle
        this.setupToggleButton();
    }

    setDarkMode(isDark) {
        const html = document.documentElement;
        
        if (isDark) {
            html.classList.add(this.DARK_CLASS);
            localStorage.setItem(this.STORAGE_KEY, 'dark');
        } else {
            html.classList.remove(this.DARK_CLASS);
            localStorage.setItem(this.STORAGE_KEY, 'light');
        }

        // Atualiza ícone do botão de toggle
        this.updateToggleButton();
    }

    toggleTheme() {
        const isDark = document.documentElement.classList.contains(this.DARK_CLASS);
        this.setDarkMode(!isDark);
    }

    setupToggleButton() {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleTheme());
        }
    }

    updateToggleButton() {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (!toggleBtn) return;

        const isDark = document.documentElement.classList.contains(this.DARK_CLASS);
        const icon = toggleBtn.querySelector('i');
        
        if (isDark) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            toggleBtn.setAttribute('aria-label', 'Alternar para modo claro');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            toggleBtn.setAttribute('aria-label', 'Alternar para modo escuro');
        }
    }

    isDarkMode() {
        return document.documentElement.classList.contains(this.DARK_CLASS);
    }
}

// Inicializa quando o DOM está pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ThemeManager();
    });
} else {
    new ThemeManager();
}
