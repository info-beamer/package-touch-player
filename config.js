'use strict'

const COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
  '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff',
  '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
  '#000075', '#808080', '#ffffff', '#000000'
]

function new_uuid() {
  let uuid = "", i, random
  for (i = 0; i < 32; i++) {
    random = Math.random() * 16 | 0
    if (i == 8 || i == 12 || i == 16 || i == 20) uuid += "-"
    uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random)).toString(16)
  }
  return uuid
}

const store = new Vuex.Store({
  strict: true,
  state: {
    assets: {},
    config: {
      pages: [],
      resolution: [1920, 1080],
      rotation: 0,
      audio: false,
      scale: false,
    },
  },
  getters: {
    all_assets(state) {
      let assets = {}
      for (let asset_id in state.assets) {
        assets[asset_id] = state.assets[asset_id]
      }
      for (let asset_id in state.node_assets) {
        assets[asset_id] = state.node_assets[asset_id]
      }
      return assets
    },
    screen(state) {
      const resolution = state.config.resolution
      const rotation = state.config.rotation
      if (rotation == 90 || rotation == 270) {
        return {w: resolution[1], h: resolution[0], is_portrait: true}
      } else {
        return {w: resolution[0], h: resolution[1], is_portrait: false}
      }
    },
    page_by_uuid(state) {
      let by_uuid = {}
      for (let page of state.config.pages) {
        by_uuid[page.uuid] = page
      }
      return by_uuid
    },
    sorted_pages(state, getters) {
      const assets = getters.all_assets
      let pages = []
      for (let page_id in state.config.pages) {
        const page = state.config.pages[page_id]
        pages.push({
          id: page_id,
          uuid: page.uuid,
          name: page.name,
          asset: assets[page.asset],
          links: page.links,
          index: page_id == 0,
        })
      }
      pages.sort((a, b) => {
        const name_a = a.name.toLocaleLowerCase()
        const name_b = b.name.toLocaleLowerCase()
        return (b.index - a.index) || name_a.localeCompare(name_b)
      })
      return pages
    },
  },
  mutations: {
    init(state, {assets, node_assets, config}) {
      state.assets = assets
      state.config = config
      state.node_assets = node_assets
    },
    set_config(state, {key, val}) {
      Vue.set(state.config, key, val)
    },
    create_page(state, {name, uuid}) {
      state.config.pages.push({
        name: name,
        uuid: uuid,
        asset: "loading.jpg",
        duration: 5,
        links: []
      })
    },
    delete_page(state, uuid) {
      let pages = state.config.pages
      for (let page_id = pages.length; page_id--; page_id >= 0) {
        const page = pages[page_id]
        if (page.uuid == uuid) {
          pages.splice(page_id, 1)
        } else {
          for (let link_id = page.links.length; link_id--; link_id >= 0) {
            const link = page.links[link_id]
            if (link.target_uuid == uuid) {
              page.links.splice(link_id, 1)
            }
          }
        }
      }
    },
    update_page(state, {uuid, key, val}) {
      for (const page of state.config.pages) {
        if (page.uuid == uuid) {
          page[key] = val
        }
      }
    },
    add_link(state, {uuid, link}) {
      for (const page of state.config.pages) {
        if (page.uuid == uuid) {
          page.links.push(link)
        }
      }
    },
    delete_link(state, {uuid, link_id}) {
      for (const page of state.config.pages) {
        if (page.uuid == uuid) {
          page.links.splice(link_id, 1)
        }
      }
    },
    update_link(state, {uuid, link_id, key, val}) {
      for (const page of state.config.pages) {
        if (page.uuid == uuid) {
          Vue.set(page.links[link_id], key, val)
        }
      }
    },
  },
  actions: {
    init({commit}, {assets, node_assets, config}) {
      commit('init', {assets, node_assets, config})
      if (config.pages.length == 0) {
        commit('create_page', {
          name: 'Index',
          uuid: new_uuid(),
        })
      }
    },
    create_page({commit}) {
      const uuid = new_uuid()
      commit('create_page', {
        name: 'New page',
        uuid
      })
      return uuid
    },
  }
})


Vue.component('asset-browser', {
  template: `
    <button class='btn btn-default btn-block' @click="onOpen">
      {{title}}
    </button>
  `,
  props: ["valid", "title", "selected_asset_spec"],
  methods: {
    async onOpen() {
      const selected = await ib.assetChooser({
        selected_asset_spec: this.selected_asset_spec,
        filter: this.valid.split(',')
      })
      if (selected) {
        this.$emit('assetSelected', selected.id);
      }
    },
  }
})

Vue.component('screen-preview', {
  template: `
    <div class='screen-preview'>
      <div class='screen'>
        <svg :style='svg_style'>
          <g :style='g_style' @mousedown='start' @mousemove='move' @mouseup='stop' @mouseleave='stop'>
            <slot/>
            <rect :x='draw.x' :y='draw.y'
              :width='draw.w' :height='draw.h'
              fill='transparent'
              stroke='#fff' stroke-width='2'
              v-if='draw'
            />
          </g>
        </svg>
      </div>
    </div>
  `,
  props: ['max_width', 'max_height'],
  data: () => ({
    mode: 'idle',
    start_x: 0,
    start_y: 0,
    draw_x: 0,
    draw_y: 0,
  }),
  computed: {
    svg_style() {
      return {
        width: this.screen.w * this.scale + 'px',
        height: this.screen.h * this.scale + 'px',
      }
    },
    g_style() {
      return {
        transform: 'scale(' + this.scale + ')',
      }
    },
    scale() {
      const screen = this.screen
      const max_w = this.max_width, max_h = this.max_height
      return Math.min(
        1 / screen.w * max_w,
        1 / screen.h * max_h,
      )
    },
    screen() {
      return this.$store.getters.screen
    },
    draw() {
      if (this.mode == 'idle' || this.mode == 'start')
        return null
      const x1 = Math.min(this.draw_x, this.start_x)
      const y1 = Math.min(this.draw_y, this.start_y)
      const x2 = Math.max(this.draw_x, this.start_x)
      const y2 = Math.max(this.draw_y, this.start_y)
      return {
        x: x1,
        y: y1,
        w: x2-x1,
        h: y2-y1,
      }
    }
  },
  methods: {
    start(e) {
      this.mode = 'start'
      this.start_x = this.draw_x = e.offsetX / this.scale
      this.start_y = this.draw_y = e.offsetY / this.scale
    },
    move(e) {
      const x = e.offsetX / this.scale, y = e.offsetY / this.scale
      if (this.mode == 'start') {
        const w = Math.abs(x - this.start_x)
        const h = Math.abs(y - this.start_y)
        if (w > 50 && h > 50) {
          this.mode = 'draw'
        }
      } else if (this.mode == 'draw') {
        this.draw_x = x
        this.draw_y = y
      }
    },
    stop(e) {
      if (this.mode == 'draw') {
        const x1 = Math.floor(Math.min(this.draw_x, this.start_x))
        const y1 = Math.floor(Math.min(this.draw_y, this.start_y))
        const x2 = Math.ceil(Math.max(this.draw_x, this.start_x))
        const y2 = Math.ceil(Math.max(this.draw_y, this.start_y))
        this.$emit('area', {x1:x1, y1:y1, x2:x2, y2:y2})
      } else if (this.mode == 'start') {
        this.$emit('click', {x: Math.floor(this.draw_x), y: Math.floor(this.draw_y)})
      }
      this.mode = 'idle'
    },
  },
})

Vue.component('link-edit', {
  template: `
    <div class='link' :style="{'background-color': link.color + '40'}">
      <img class='link-type' :src='"icon-" + link.type + ".png"' :title='"On " + link.type'>
      ⮕
      <template v-if='link.target_uuid == "back"'>
        <img src='icon-back.png'>
      </template>
      <template v-else>
        <router-link :to='{name: "page", params: {uuid: link.target_uuid}}' class='link-target'>
          <img class='link-target' :src='link.asset.thumb + "?size=40"'>
        </router-link>
      </template>
      &nbsp;&nbsp;

      <select class="form-control target-transition" v-model='transition'>
        <option :value='transition[0]' :key='transition[0]' v-for='transition in transitions'>
          {{transition[1]}}
        </option>
      </select>
      to
      <select class="form-control target-page" v-model='target_uuid'>
        <option
          :value='page.uuid' :key='page.uuid' :disabled='page.disabled'
          v-for='page in target_pages'
        >
          {{page.name}}
        </option>
      </select>
      <span v-if='link.type == "timeout"'>
        after
        <select class="form-control timeout-select" v-model='timeout'>
          <option :value='timeout.t' :disabled='timeout.disabled' v-for='timeout in timeouts'>
            <template v-if='timeout.disabled'>
              {{timeout.disabled}}
            </template>
            <template v-else-if='timeout.text'>
              {{timeout.text}}
            </template>
            <template v-else>
              {{timeout.t | human_duration}}
            </template>
          </option>
        </select>
      </span>
      <span v-if='link.type == "gpio"'>
        on GPIO Pin
        <select class="form-control gpio-select" v-model='gpio'>
          <option :value='gpio.value' v-for='gpio in gpios'>
            {{gpio.text}}
          </option>
        </select>
      </span>
      <span v-if='link.type == "key"'>
        on press of
        <select class="form-control key-select" v-model='key'>
          <option :value='key.v' v-for='key in keys'>
            {{key.text}}
          </option>
        </select>
      </span>

      <button class='btn btn-danger btn-xs delete-link' @click='delete_link(link_id)'>
        ✗
      </button>
    </div>
  `,
  props: ['page', 'link_id', 'link'],
  computed: {
    transition: {
      get() {
        return this.link.transition
      },
      set(v) {
        this.$store.commit('update_link', {
          uuid: this.page.uuid,
          link_id: this.link.id,
          key: 'transition', val: v,
        })
      },
    },
    timeout: {
      get() {
        return this.link.options.timeout
      },
      set(v) {
        this.$store.commit('update_link', {
          uuid: this.page.uuid,
          link_id: this.link.id,
          key: 'options', val: {
            timeout: v
          }
        })
      },
    },
    key: {
      get() {
        return this.link.options.key
      },
      set(v) {
        this.$store.commit('update_link', {
          uuid: this.page.uuid,
          link_id: this.link.id,
          key: 'options', val: {
            key: v,
          }
        })
      },
    },
    gpio: {
      get() {
        return this.link.options
      },
      set(v) {
        this.$store.commit('update_link', {
          uuid: this.page.uuid,
          link_id: this.link.id,
          key: 'options', val: v
        })
      },
    },
    timeouts() {
      let timeouts = [
        {disabled: 'Defaults'},
        {t:2}, {t:5}, {t:10}, {t:15},  {t:30},  {t:45},  {t:60}, {t:300}, {t:600}, {t:900},
      ]
      const assets = this.$store.getters.all_assets
      const asset = assets[this.page.asset]
      if (asset.filetype == 'video') {
        const duration = asset.metadata.duration
        if (duration) {
          timeouts.push({disabled:'Video Asset'})
          timeouts.push({text: 'one loop', t:duration})
          timeouts.push({text: '2 loops', t:duration*2})
          timeouts.push({text: '3 loops', t:duration*3})
          timeouts.push({text: '4 loops', t:duration*4})
        }
      }
      return timeouts
    },
    gpios() {
      let gpios = []
      for (let pin of [5, 6, 16, 17, 22, 23, 24, 25, 26, 27]) {
        gpios.push({value: {pin: pin, active_high: true}, text: pin + ' (active high)'})
        gpios.push({value: {pin: pin, active_high: false}, text: pin + ' (active low)'})
      }
      return gpios
    },
    keys() {
      return [
        {v: "space", text: "Space Key"},
        {v: "a", text: "Key 'A'"},
        {v: "b", text: "Key 'B'"},
        {v: "c", text: "Key 'C'"},
        {v: "d", text: "Key 'D'"},
        {v: "e", text: "Key 'E'"},
        {v: "f", text: "Key 'F'"},
        {v: "g", text: "Key 'G'"},
        {v: "h", text: "Key 'H'"},
        {v: "i", text: "Key 'I'"},
        {v: "j", text: "Key 'J'"},
        {v: "k", text: "Key 'K'"},
        {v: "l", text: "Key 'L'"},
        {v: "m", text: "Key 'M'"},
        {v: "n", text: "Key 'N'"},
        {v: "o", text: "Key 'O'"},
        {v: "p", text: "Key 'P'"},
        {v: "q", text: "Key 'Q'"},
        {v: "r", text: "Key 'R'"},
        {v: "s", text: "Key 'S'"},
        {v: "t", text: "Key 'T'"},
        {v: "u", text: "Key 'U'"},
        {v: "v", text: "Key 'V'"},
        {v: "w", text: "Key 'W'"},
        {v: "x", text: "Key 'X'"},
        {v: "y", text: "Key 'Y'"},
        {v: "z", text: "Key 'Z'"},

        {v: "0", text: "Key '0'"},
        {v: "1", text: "Key '1'"},
        {v: "2", text: "Key '2'"},
        {v: "3", text: "Key '3'"},
        {v: "4", text: "Key '4'"},
        {v: "5", text: "Key '5'"},
        {v: "6", text: "Key '6'"},
        {v: "7", text: "Key '7'"},
        {v: "8", text: "Key '8'"},
        {v: "9", text: "Key '9'"},

        {v: "kp0", text: "Numpad 0"},
        {v: "kp1", text: "Numpad 1"},
        {v: "kp2", text: "Numpad 2"},
        {v: "kp3", text: "Numpad 3"},
        {v: "kp4", text: "Numpad 4"},
        {v: "kp5", text: "Numpad 5"},
        {v: "kp6", text: "Numpad 6"},
        {v: "kp7", text: "Numpad 7"},
        {v: "kp8", text: "Numpad 8"},
        {v: "kp9", text: "Numpad 9"},

        {v: "kpdot",      text: "Numpad ,"},
        {v: "kpslash",    text: "Numpad /"},
        {v: "kpplus",     text: "Numpad +"},
        {v: "kpminus",    text: "Numpad -"},
        {v: "kpasterisk", text: "Numpad *"},
        {v: "kpenter",    text: "Numpad Enter"},
        {v: "numlock",    text: "Num Lock"},

        {v: "f1", text: "F1"},
        {v: "f2", text: "F2"},
        {v: "f3", text: "F3"},
        {v: "f4", text: "F4"},
        {v: "f5", text: "F5"},
        {v: "f6", text: "F6"},
        {v: "f7", text: "F7"},
        {v: "f8", text: "F8"},
        {v: "f9", text: "F9"},
        {v: "f10",text: "F10"},
        {v: "f11",text: "F11"},
        {v: "f12",text: "F12"},

        {v: "left", text: "Cursor Left"},
        {v: "right", text: "Cursor Right"},
        {v: "up", text: "Cursor Up"},
        {v: "down", text: "Cursor Down"},

        {v: "leftshift", text: "Left Shift"},
        {v: "leftctrl", text: "Left Ctrl"},
        {v: "leftalt", text: "Left Alt"},
        {v: "leftmeta", text: "Left Meta"},
        {v: "rightshift", text: "Right Shift"},
        {v: "rightctrl", text: "Right Ctrl"},
        {v: "rightalt", text: "Right Alt"},
        {v: "rightmeta", text: "Right Meta"},

        {v: "backspace", text: "Backspace"},
        {v: "compose", text: "Compose"},
        {v: "capslock", text: "Capslock"},
        {v: "esc", text: "Escape"},
        {v: "enter", text: "Enter"},
        {v: "tab", text: "Tab"},
      ]
    },
    target_uuid: {
      get() {
        return this.link.target_uuid
      },
      async set(v) {
        let uuid = v
        if (uuid == null) { // "new page" select
          uuid = await this.$store.dispatch('create_page')
        }
        console.log(this.$store.getters.sorted_pages)
        this.$store.commit('update_link', {
          uuid: this.page.uuid,
          link_id: this.link.id,
          key: 'target_uuid', val: uuid,
        })
      },
    },
    target_pages() {
      let pages = []
      pages.push({
        disabled: true, name: '☰ Your Pages',
      })

      for (const page of this.$store.getters.sorted_pages) {
        pages.push(page)
      }
      pages.push({
        disabled: true, name: '☰ Special targets ',
      })
      pages.push({uuid: 'back', name: 'Previous page'})
      pages.push({uuid: null, name: 'Create new page..'})
      return pages
    },
    transitions() {
      return [
        ["l2r", "Slide left"],
        ["r2l", "Slide right"],
        ["t2b", "Slide up"],
        ["b2t", "Slide down"],
        ["zoom_in", "Zoom in"],
        ["zoom_out", "Zoom out"],
        ["fade", "Fade"],
        ["none", "Instant switch"]
      ]
    }
  },
  methods: {
    delete_link(link_id) {
      this.$store.commit('delete_link', {
        uuid: this.page.uuid, link_id
      })
    },
  },
})

const PageEdit = Vue.component('page-edit', {
  template: `
    <div>
      <h2>{{page_name}} page</h2>
      <div class='row'>
        <div class='col-xs-3'>
          <router-link :to='{name: "index"}' class='btn btn-default btn-block'>
            <span class='glyphicon glyphicon-th-list'></span>
            Settings / Page list
          </router-link>
        </div>
        <div class='col-xs-6'>
          <input class='form-control'
            v-model='page_name'
            placeholder="Set a descriptive page name"
          />
        </div>
        <div class='col-xs-3'>
          <asset-browser
            valid="image,video"
            title="Select page asset.."
            :selected_asset_spec="asset.id"
            @assetSelected="select_asset"
          />
        </div>
      </div>
      <screen-preview
        :max_width='736' :max_height='800'
        @area='area' @click='click'
      >
        <image
          :href='asset.thumb + "?size=500&crop=none"'
          :preserveAspectRatio='aspect_ratio'
          :width='$store.getters.screen.w'
          :height='$store.getters.screen.h'
        />
        <text x='5' y='25' fill="#ccc" style="font-size:25px" v-if='touch_links.length == 0'>
          Click and drag to draw touch area
        </text>
        <g v-for='link in touch_links' class='link-preview'>
          <template v-if='link.id == resize_link_id'>
            <rect :x='link.options.x1' :y='link.options.y1'
              :width='link.options.x2-link.options.x1'
              :height='link.options.y2-link.options.y1'
              fill='white' fill-opacity='0.1'
            />
            <text :x="link.options.x1+5" :y="link.options.y1+25"
              fill="#ccc" style="font-size:25px"
            >
              Redraw touch area
            </text>
          </template>
          <template v-else>
            <image
              :href='link.asset.thumb + "?size=500&crop=none"'
              :x='link.options.x1' :y='link.options.y1'
              :width='link.options.x2-link.options.x1'
              :height='link.options.y2-link.options.y1'
              v-if='link.target_uuid != "back"'
            />
            <rect :x='link.options.x1' :y='link.options.y1'
              :width='link.options.x2-link.options.x1'
              :height='link.options.y2-link.options.y1'
              :fill='link.color' fill-opacity='0.3'
              stroke='#fff' stroke-width='2'
            />
            <text :x="link.options.x1+5" :y="link.options.y1+25"
              fill="white" style="font-size:25px"
            >
              <tspan style='cursor:pointer' @mousedown.stop @click='resize_link(link.id)'>Resize</tspan>
              |
              <tspan style='cursor:pointer' @mousedown.stop @click='delete_link(link.id)'>Delete</tspan>
            </text>
          </template>
        </g>
      </screen-preview>
      <label>Links</label>
      <link-edit
        :page='current_page' :link_id='link.id' :link='link'
        v-for='link in links'
      />
      <div class='alert alert-warning' v-if='links.length == 0'>
        No links yet. This page will loop endlessly. Draw an area in the screen preview above or add a timeout/fullscreen event to link this page to other pages.
      </div>
      <div class='text-right'>
        <button class='btn btn-default align-top' @click='add_fullscreen'>
          Add fullscreen touch
        </button>
        <button class='btn btn-default align-top' @click='add_timeout' v-if='!has_timeout'>
          Add timeout
        </button>
        <button class='btn btn-default align-top' @click='add_gpio'>
          Add GPIO
        </button>
        <button class='btn btn-default align-top' @click='add_key'>
          Add Keypress
        </button>
      </div>
    </div>
  `,
  data: () => ({
    current_uuid: null,
    resize_link_id: null,
  }),
  created() {
    this.fetch()
  },
  watch: {
    '$route': 'fetch'
  },
  computed: {
    current_page() {
      const by_uuid = this.$store.getters.page_by_uuid
      return by_uuid[this.current_uuid]
    },
    links() {
      const page = this.current_page
      const by_uuid = this.$store.getters.page_by_uuid
      const assets = this.$store.getters.all_assets
      let links = []
      for (let link_id in page.links) {
        const link = page.links[link_id]
        console.log(link)
        if (link.target_uuid == 'back') {
          links.push({
            id: link_id,
            target_uuid: link.target_uuid,
            transition: link.transition,
            type: link.type,
            options: link.options,
            color: COLORS[link_id % COLORS.length],
          })
        } else {
          const target = by_uuid[link.target_uuid]
          links.push({
            id: link_id,
            target_uuid: link.target_uuid,
            transition: link.transition,
            type: link.type,
            options: link.options,
            color: COLORS[link_id % COLORS.length],
            asset: assets[target.asset],
          })
        }
        // links.sort((a, b) => {
        //   return a.type.localeCompare(b.type)
        // })
      }
      return links
    },
    aspect_ratio() {
      let scale = this.$store.state.config.scale
      return scale ? 'xMidYMid meet' : 'none'
    },
    touch_links() {
      return this.links.filter(l => l.type == 'touch')
    },
    has_timeout() {
      for (const link of this.current_page.links) {
        if (link.type == "timeout")
          return true
      }
      return false
    },
    page_name: {
      get() {
        return this.current_page.name
      },
      set(v) {
        this.$store.commit('update_page', {
          uuid: this.current_uuid,
          key: 'name', val: v,
        })
      }
    },
    asset() {
      const asset_id = this.current_page.asset
      return this.$store.getters.all_assets[asset_id]
    },
    default_uuid() {
      return this.$store.getters.sorted_pages[0].uuid
    }
  },
  methods: {
    fetch() {
      let uuid = this.$route.params.uuid
      if (!uuid) {
        uuid = this.default_uuid
      }
      this.current_uuid = uuid
      console.log('current_uuid=', uuid)
    },
    click(click) {
      const links = this.links
      for (let id = links.length; id--; id >= 0) {
        const link = links[id]
        if (link.type == 'touch' &&
            link.options.x1 <= click.x && click.x <= link.options.x2 &&
            link.options.y1 <= click.y && click.y <= link.options.y2
        ) {
          if (link.target_uuid == 'back') {
            router.go(-1)
          } else {
            router.push({name: 'page', params: {uuid: link.target_uuid}})
          }
          break
        }
      }
    },
    select_asset(asset_id) {
      this.$store.commit('update_page', {
        uuid: this.current_uuid,
        key: 'asset',
        val: asset_id,
      })
      let asset = this.$store.getters.all_assets[asset_id]
      let duration = 10
      if (asset.filetype == "video") {
        duration = asset.metadata.duration
      }
      for (let link of this.links) {
        if (link.type != "timeout")
          continue
        this.$store.commit('update_link', {
          uuid: this.current_uuid,
          link_id: link.id,
          key: 'options', val: {
            timeout: duration
          }
        })
      }
    },
    area(area) {
      if (this.resize_link_id != null) {
        this.$store.commit('update_link', {
          uuid: this.current_uuid,
          link_id: this.resize_link_id,
          key: 'options', val: {
            x1: area.x1,
            y1: area.y1,
            x2: area.x2,
            y2: area.y2,
          }
        })
        this.resize_link_id = null
      } else {
        this.add_touch(area)
      }
    },
    add_timeout() {
      this.$store.commit('add_link', {
        uuid: this.current_uuid,
        link: {
          target_uuid: this.default_uuid,
          transition: 'zoom_in',
          type: 'timeout',
          options: {
            timeout: 10,
          }
        }
      })
    },
    add_fullscreen() {
      const screen = this.$store.getters.screen
      this.add_touch({
        x1: 0, y1: 0,
        x2: screen.w, y2: screen.h,
      })
    },
    add_touch(area) {
      this.$store.commit('add_link', {
        uuid: this.current_uuid,
        link: {
          target_uuid: this.default_uuid,
          transition: 'zoom_in',
          type: 'touch',
          options: {
            x1: area.x1,
            y1: area.y1,
            x2: area.x2,
            y2: area.y2,
          }
        }
      })
    },
    add_key() {
      this.$store.commit('add_link', {
        uuid: this.current_uuid,
        link: {
          target_uuid: this.default_uuid,
          transition: 'zoom_in',
          type: 'key',
          options: {
            key: 'enter',
          }
        }
      })
    },
    add_gpio() {
      this.$store.commit('add_link', {
        uuid: this.current_uuid,
        link: {
          target_uuid: this.default_uuid,
          transition: 'zoom_in',
          type: 'gpio',
          options: {
            pin: 23,
            active_high: true,
          }
        }
      })
    },
    resize_link(link_id) {
      this.resize_link_id = link_id
    },
    delete_link(link_id) {
      this.$store.commit('delete_link', {
        uuid: this.current_uuid, link_id
      })
    },
  },
})

const PageList = Vue.component('page-list', {
  template: `
    <div>
      <h2>Pages</h2>
      <table class='table table-condensed'>
        <tbody>
          <tr v-for='page in $store.getters.sorted_pages'>
            <td width='50'>
              <router-link :to='{name: "page", params: {uuid: page.uuid}}' class='link-target'>
                <img class='link-target' :src='page.asset.thumb + "?size=40"'>
              </router-link>
            </td>
            <td>
              <b>{{page.name}}</b>
              <span v-if='page.index'>
                - Home/Start page
              </span>
              <br>
              {{page.links.length}} links
            </td>
            <td class='text-right'>
              <button class='btn btn-danger btn-xs delete-page' @click='delete_page(page.uuid)' v-if='!page.index'>
                ✗
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <hr/>
      <h3>General settings</h3>
      <div class='row'>
        <div class='col-xs-3'>
          <label>Resolution</label>
          <select class="form-control" v-model='resolution'>
            <option :value='resolution[0]' v-for='resolution in resolutions'>
              {{resolution[1]}}
            </option>
          </select>
        </div>
        <div class='col-xs-3'>
          <label>Rotation</label>
          <select class="form-control" v-model='rotation'>
            <option :value='rotation[0]' v-for='rotation in rotations'>
              {{rotation[1]}}
            </option>
          </select>
        </div>
        <div class='col-xs-3'>
          <label>Audio</label>
          <select class="form-control" v-model='audio'>
            <option :value='opt[0]' v-for='opt in audio_options'>
              {{opt[1]}}
            </option>
          </select>
        </div>
        <div class='col-xs-3'>
          <label>Scaling</label>
          <select class="form-control" v-model='scale'>
            <option :value='opt[0]' v-for='opt in scale_options'>
              {{opt[1]}}
            </option>
          </select>
        </div>
      </div>
    </div>
  `,
  data: () => ({
    resolutions: [
      [[800,   480], "800x480"],
      [[1280,  720], "1280x720 HD"],
      [[1280, 1024], "1280x1024 5:4"],
      [[1920, 1080], "1920x1080 FullHD"],
    ],
    rotations: [
      [0, "No rotation"],
      [90, "90° clockwise"],
      [180, "180°"],
      [270, "270°"],
    ],
    audio_options: [
      [false, "No audio"],
      [true, "For all videos"],
    ],
    scale_options: [
      [false, "Force fullscreen"],
      [true, "Preserve aspect ratio"],
    ],
  }),
  computed: {
    resolution: {
      get() {
        return this.$store.state.config.resolution
      },
      set(v) {
        this.$store.commit('set_config', {
          key: 'resolution',
          val: v,
        })
      },
    },
    rotation: {
      get() {
        return this.$store.state.config.rotation
      },
      set(v) {
        this.$store.commit('set_config', {
          key: 'rotation',
          val: v,
        })
      },
    },
    audio: {
      get() {
        return this.$store.state.config.audio
      },
      set(v) {
        this.$store.commit('set_config', {
          key: 'audio',
          val: v,
        })
      },
    },
    scale: {
      get() {
        return this.$store.state.config.scale
      },
      set(v) {
        this.$store.commit('set_config', {
          key: 'scale',
          val: v,
        })
      },
    },
  },
  methods: {
    delete_page(uuid) {
      this.$store.commit('delete_page', uuid)
    },
  }
})

Vue.filter('capitalize', value => {
  if (!value) return ''
  value = value.toString()
  return value.charAt(0).toUpperCase() + value.slice(1)
})
Vue.filter('human_duration', value => {
  if (value > 120) {
    return (value / 60).toFixed(0) + ' minutes'
  } else {
    return value.toFixed(0) + ' seconds'
  }
})

const router = new VueRouter({
  routes: [
    {path: '/', name: 'index', component: PageList},
    {path: '/page/:uuid', name: 'page', component: PageEdit},
  ],
})

ib.setDefaultStyle()

ib.ready.then(() => {
  store.dispatch('init', {
    assets: ib.assets,
    node_assets: ib.node_assets,
    config: ib.config,
  })
  store.subscribe((mutation, state) => {
    ib.setConfig(state.config)
  })

  new Vue({
    el: "#app", router, store,
  })
})

