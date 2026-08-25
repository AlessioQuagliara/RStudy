import { sync } from "glob"
import { defineConfig } from "vite"

import injectHTML from "vite-plugin-html-inject"

const removecors = () => {
    return {
        name: "remove-cors",
        transformIndexHtml: {
            order: "post",
            handler(html) {
                return html.replace(/crossorigin\s*/g, "")
            },
        },
    }
}

export default defineConfig(({ command, mode, ssrBuild }) => {
    return {
        base: "",
        root: "src",
        server: {
            open: true,
        },
        plugins: [injectHTML(), removecors()],
        publicDir: "../public",
        build: {
            outDir: "../html",
            emptyOutDir: true,
            rollupOptions: {
                input: sync("src/*.html"),
                output: {
                    entryFileNames: `assets/[name].js`,
                    chunkFileNames: `assets/[name].js`,
                    assetFileNames: `assets/[name].[ext]`,
                },
            },
        },
    }
})
