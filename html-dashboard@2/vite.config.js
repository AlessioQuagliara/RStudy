import { defineConfig } from "vite"
import {
	createReadStream,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(rootDir, "src")
const pagesDir = resolve(rootDir, "src", "pages")
const partialsDir = resolve(rootDir, "src", "partials")
const publicDir = resolve(rootDir, "public")
const outputCssFile = resolve(rootDir, "public", "output.css")

function getHtmlInputs(dir = pagesDir, inputs = {}) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			getHtmlInputs(join(dir, entry.name), inputs)
			continue
		}

		if (entry.isFile() && entry.name.endsWith(".html")) {
			const file = join(dir, entry.name)
			const name = relative(pagesDir, file).replace(/\.html$/, "")
			inputs[name] = file
		}
	}

	return inputs
}

function htmlPartials() {
	const includePattern = /{{>\s*([a-zA-Z0-9_./-]+)\s*}}/g

	function resolveInclude(name) {
		const partialName = name.endsWith(".html") ? name : `${name}.html`
		const file = resolve(partialsDir, partialName)

		if (!file.startsWith(partialsDir)) {
			throw new Error(`HTML partials must be loaded from src/partials: ${name}`)
		}

		return file
	}

	function render(html) {
		return html.replace(includePattern, (_, name) => {
			const file = resolveInclude(name)
			const partial = readFileSync(file, "utf8")

			return render(partial)
		})
	}

	return {
		name: "html-partials",
		enforce: "pre",
		transformIndexHtml: {
			order: "pre",
			handler(html, context) {
				return render(html, context.filename)
			},
		},
		handleHotUpdate({ file, server }) {
			if (file.endsWith(".html")) {
				server.ws.send({
					type: "full-reload",
					path: "*",
				})
			}
		},
		configureServer(server) {
			if (statSync(partialsDir, { throwIfNoEntry: false })) {
				server.watcher.add(partialsDir)
			}

			server.middlewares.use((request, response, next) => {
				if (request.url === "/output.css") {
					response.setHeader("Content-Type", "text/css")
					createReadStream(outputCssFile).pipe(response)
					return
				}

				if (request.url !== "/") {
					next()
					return
				}

				request.url = "/index.html"
				next()
			})
		},
		closeBundle() {
			for (const [name, file] of Object.entries(getHtmlInputs())) {
				const html = render(readFileSync(file, "utf8"))
				const outputFile = resolve(publicDir, `${name}.html`)

				mkdirSync(dirname(outputFile), { recursive: true })
				writeFileSync(outputFile, html.replace(/{{\s*outputCss\s*}}/g, "/output.css"))
			}
		},
	}
}

function staticOutputCss() {
	return {
		name: "static-output-css",
		transformIndexHtml: {
			order: "post",
			handler(html) {
				return html.replace(/{{\s*outputCss\s*}}/g, "/output.css")
			},
		},
	}
}

function devSidebarScrollMemory() {
	function normalizePath(pathname) {
		const path = pathname.replace(/\/$/, "")

		return !path || path === "/" ? "/index.html" : path
	}

	function openCurrentSidebarGroup(html, path) {
		const currentPath = normalizePath(path)
		const detailsPattern = /<details(?:\s+open)?(\s+name="sidebar-group")>([\s\S]*?)<\/details>/g

		return html.replace(detailsPattern, (details, attributes, content) => {
			const isCurrent = content.includes(`href="${currentPath}"`)

			return `<details${isCurrent ? " open" : ""}${attributes}>${content}</details>`
		})
	}

	function injectBeforeLastAsideClose(html, injection) {
		const index = html.lastIndexOf("</aside>")

		if (index === -1) {
			return html
		}

		return `${html.slice(0, index)}${injection}\n${html.slice(index)}`
	}

	const head = String.raw`
		<style>
			aside.drawer-side {
				visibility: hidden;
			}

			html[data-dashboard-sidebar-ready] aside.drawer-side {
				visibility: visible;
			}
		</style>`
	const body = String.raw`
		<script>
			const storageKey = "dashboard:sidebar-scroll-top"

			function getSidebarScroller(sidebar) {
				const candidates = [sidebar, sidebar.querySelector("nav")].filter(Boolean)

				return candidates.find((element) => element.scrollHeight > element.clientHeight) || sidebar
			}

			function showSidebar() {
				document.documentElement.dataset.dashboardSidebarReady = ""
			}

			const sidebar = document.querySelector("aside.drawer-side")

			if (sidebar) {
				const scroller = getSidebarScroller(sidebar)
				const restoreScroll = () => {
					scroller.scrollTop = Number(sessionStorage.getItem(storageKey) || 0)
				}
				const saveScroll = () => {
					sessionStorage.setItem(storageKey, String(scroller.scrollTop))
				}

				restoreScroll()
				requestAnimationFrame(() => {
					restoreScroll()
					showSidebar()
				})
				scroller.addEventListener("scroll", saveScroll, { passive: true })
				sidebar.addEventListener("pointerdown", saveScroll, { passive: true })
				window.addEventListener("pagehide", saveScroll)
			} else {
				showSidebar()
			}

			setTimeout(showSidebar, 100)
		</script>`

	return {
		name: "dev-sidebar-scroll-memory",
		transformIndexHtml: {
			order: "post",
			handler(html, context) {
				if (!context.server) {
					return html
				}

				const withCurrentSidebarGroup = openCurrentSidebarGroup(html, context.path)

				return injectBeforeLastAsideClose(
					withCurrentSidebarGroup.replace("</head>", `${head}\n\t</head>`),
					body
				)
			},
		},
	}
}

export default defineConfig({
	root: pagesDir,
	server: {
		open: true,
		watch: {
			ignored: ["**/node_modules/**"],
		},
	},
	plugins: [htmlPartials(), staticOutputCss(), devSidebarScrollMemory()],
	build: {
		outDir: "../../public",
		emptyOutDir: true,
		modulePreload: {
			polyfill: false,
		},
		rollupOptions: {
			input: getHtmlInputs(),
		},
	},
	publicDir: false,
	appType: "mpa",
})
