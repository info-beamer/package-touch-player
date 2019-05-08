util.no_globals()

local TRANSITION_TIME = 0.3

local json = require "json"
local matrix = require "matrix2d"
local easing = require "easing"

local frame_delay = 1/60
pcall(function()
    local fps, swap_interval = sys.get_ext("screen").get_display_info()
    if fps == 0 then
        fps = 60
    end
    frame_delay = 1 / fps * swap_interval
    print("detected frame delay is", frame_delay)
end)

local audio = false
local input_state = { down = false, x = 0, y = 0, }

local function VirtualScreen()
    local screen, virtual2pixel, pixel2virtual
    local virtual_w, virtual_h
    local translate_0_x, translate_0_y
    local scale_x, scale_y

    local function update(new_screen)
        screen = new_screen

        gl.setup(NATIVE_WIDTH, NATIVE_HEIGHT)
        virtual_w, virtual_h = screen.res_x , screen.res_y

        scale_x = NATIVE_WIDTH / virtual_w
        scale_y = NATIVE_HEIGHT / virtual_h

        if screen.rotation == 0 then
            translate_0_x, translate_0_y = 0, 0
        elseif screen.rotation == 90 then
            translate_0_x, translate_0_y = WIDTH, 0
            virtual_w, virtual_h = virtual_h, virtual_w
        elseif screen.rotation == 180 then
            translate_0_x, translate_0_y = WIDTH, HEIGHT
        elseif screen.rotation == 270 then
            translate_0_x, translate_0_y = 0, HEIGHT
            virtual_w, virtual_h = virtual_h, virtual_w
        end

        WIDTH = virtual_w
        HEIGHT = virtual_h

        virtual2pixel = matrix.trans(translate_0_x, translate_0_y)
                      * matrix.scale(scale_x, scale_y)
                      * matrix.rotate_deg(screen.rotation)
        pixel2virtual = -virtual2pixel
    end

    local function project(x1, y1, x2, y2)
        x1, y1 = virtual2pixel(x1, y1)
        x2, y2 = virtual2pixel(x2, y2)
        return math.floor(math.min(x1, x2)), math.floor(math.min(y1, y2)),
               math.floor(math.max(x1, x2)), math.floor(math.max(y1, y2))
    end

    local function unproject(x, y)
        x, y = pixel2virtual(x, y)
        return math.floor(x), math.floor(y)
    end

    local function video(vid, x1, y1, x2, y2, layer, alpha)
        layer = layer or 1
        x1, y1, x2, y2 = project(x1, y1, x2, y2)
        return vid:alpha(alpha):place(
            x1, y1, x2, y2, screen.rotation
        ):layer(layer)
    end

    local function setup()
        gl.translate(translate_0_x, translate_0_y)
        gl.scale(scale_x, scale_y)
        gl.rotate(screen.rotation, 0, 0, 1)
    end

    return {
        update = update;
        unproject = unproject;
        setup = setup;
        video = video;
    }
end
local screen = VirtualScreen()

local function ImageLRU(max_cached)
    max_cached = max_cached or 10
    local loaded = {}
    local function load(file)
        if #loaded > max_cached then
            for i = #loaded, 1, -1 do
                local img = loaded[i]
                if img.usage == 0 then
                    img.obj:dispose()
                end
                print("disposing", img.file)
                table.remove(loaded, i)
                break
            end
        end
        for i, img in ipairs(loaded) do
            if img.file == file then
                img.usage = img.usage + 1
                return img.obj
            end
        end
        local obj = resource.load_image(file:copy())
        print("loaded", file)
        table.insert(loaded, 1, {
            file = file,
            obj = obj,
            usage = 1,
        })
        return obj
    end
    local function release(obj)
        for i, img in ipairs(loaded) do
            if img.obj == obj then
                img.usage = img.usage - 1
                assert(img.usage >= 0)
                return
            end
        end
        error "unknown image released"
    end

    return {
        load = load,
        release = release,
    }
end

local img_cache = ImageLRU(10)

local function Image(file)
    local res

    local function draw_res(res, x1, y1, x2, y2, alpha)
        return res:draw(x1, y1, x2, y2, alpha or 1)
    end

    local effects = {
        l2r = {
            enter = function(progress)
                local xoff = -WIDTH * easing.inOutQuad(1-progress, 0, 1, 1)
                draw_res(res, 0+xoff, 0, WIDTH+xoff, HEIGHT)
            end,
            exit = function(progress)
                local xoff = WIDTH * easing.inOutQuad(progress, 0, 1, 1)
                draw_res(res, 0+xoff, 0, WIDTH+xoff, HEIGHT)
            end,
        },
        r2l = {
            enter = function(progress)
                local xoff = WIDTH * easing.inOutQuad(1-progress, 0, 1, 1)
                draw_res(res, 0+xoff, 0, WIDTH+xoff, HEIGHT)
            end,
            exit = function(progress)
                local xoff = -WIDTH * easing.inOutQuad(progress, 0, 1, 1)
                draw_res(res, 0+xoff, 0, WIDTH+xoff, HEIGHT)
            end,
        },
        t2b = {
            enter = function(progress)
                local yoff = -HEIGHT * easing.inOutQuad(1-progress, 0, 1, 1)
                draw_res(res, 0, 0+yoff, WIDTH, HEIGHT+yoff)
            end,
            exit = function(progress)
                local yoff = HEIGHT * easing.inOutQuad(progress, 0, 1, 1)
                draw_res(res, 0, 0+yoff, WIDTH, HEIGHT+yoff)
            end,
        },
        b2t = {
            enter = function(progress)
                local yoff = HEIGHT * easing.inOutQuad(1-progress, 0, 1, 1)
                draw_res(res, 0, 0+yoff, WIDTH, HEIGHT+yoff)
            end,
            exit = function(progress)
                local yoff = -HEIGHT * easing.inOutQuad(progress, 0, 1, 1)
                draw_res(res, 0, 0+yoff, WIDTH, HEIGHT+yoff)
            end,
        },
        fade = {
            enter = function(progress)
                draw_res(res, 0, 0, WIDTH, HEIGHT, progress)
            end,
            exit = function(progress)
                draw_res(res, 0, 0, WIDTH, HEIGHT, 1-progress)
            end,
        },
        zoom_out = {
            enter = function(progress)
                progress = easing.outQuint(progress, 0, 1, 1)
                local aspect = WIDTH / HEIGHT
                local extra = WIDTH / 15 * (1-progress)
                draw_res(res,
                    0 - extra*aspect, 0 - extra,
                    WIDTH + extra*aspect, HEIGHT + extra,
                    progress
                )
            end,
            exit = function(progress)
                progress = easing.inQuint(progress, 0, 1, 1)
                local aspect = WIDTH / HEIGHT
                local extra = WIDTH / 15 * progress
                draw_res(res,
                    0 + extra*aspect, 0 + extra,
                    WIDTH - extra*aspect, HEIGHT - extra,
                    1
                    -- 1 - progress
                )
            end,
        },
        zoom_in = {
            enter = function(progress)
                progress = easing.inQuad(progress, 0, 1, 1)
                local aspect = WIDTH / HEIGHT
                local extra = -WIDTH / 10 * (1-progress)
                draw_res(res,
                    -extra*aspect, -extra,
                    WIDTH + extra*aspect, HEIGHT + extra,
                    progress
                )
            end,
            exit = function(progress)
                progress = easing.inQuad(progress, 0, 1, 1)
                local aspect = WIDTH / HEIGHT
                local extra = -WIDTH / 10 * progress
                draw_res(res,
                    extra*aspect, extra,
                    WIDTH - extra*aspect, HEIGHT - extra,
                    1 - progress
                )
            end,
        }
    }

    local function load()
        res = img_cache.load(file)
    end

    local function ready()
        return res and res:state() ~= "loading"
    end

    local function draw(mode, effect, progress)
        if mode == "play" then
            draw_res(res, 0, 0, WIDTH, HEIGHT)
        elseif mode == "load" then
            draw_res(res, 0, 0, WIDTH, HEIGHT) --, .95)
        else
            effects[effect][mode](progress)
        end
    end

    local function unload()
        img_cache.release(res)
    end

    return {
        load = load;
        ready = ready;
        draw = draw;
        unload = unload;
        frame_delay = 2*frame_delay; -- double buffered output
    }
end

local function Video(file)
    local res

    local function draw_res(res, layer, alpha, x1_add, y1_add, x2_add, y2_add)
        x1_add = x1_add or 0
        y1_add = y1_add or 0
        x2_add = x2_add or x1_add
        y2_add = y2_add or y1_add
        local _, w, h = res:state()
        if w and h then
            screen.video(res, x1_add, y1_add, WIDTH+x2_add, HEIGHT+y2_add, layer, alpha)
        end
    end

    local effects = {
        l2r = {
            enter = function(progress)
                local xoff = -WIDTH * easing.inOutQuad(1-progress, 0, 1, 1)
                draw_res(res, -1, 1, xoff, 0)
            end,
            exit = function(progress)
                local xoff = WIDTH * easing.inOutQuad(progress, 0, 1, 1)
                draw_res(res, -2, 1, xoff, 0)
            end,
        },
        r2l = {
            enter = function(progress)
                local xoff = WIDTH * easing.inOutQuad(1-progress, 0, 1, 1)
                draw_res(res, -1, 1, xoff, 0)
            end,
            exit = function(progress)
                local xoff = -WIDTH * easing.inOutQuad(progress, 0, 1, 1)
                draw_res(res, -2, 1, xoff, 0)
            end,
        },
        t2b = {
            enter = function(progress)
                local yoff = -HEIGHT * easing.inOutQuad(1-progress, 0, 1, 1)
                draw_res(res, -1, 1, 0, yoff)
            end,
            exit = function(progress)
                local yoff = HEIGHT * easing.inOutQuad(progress, 0, 1, 1)
                draw_res(res, -2, 1, 0, yoff)
            end,
        },
        b2t = {
            enter = function(progress)
                local yoff = HEIGHT * easing.inOutQuad(1-progress, 0, 1, 1)
                draw_res(res, -1, 1, 0, yoff)
            end,
            exit = function(progress)
                local yoff = -HEIGHT * easing.inOutQuad(progress, 0, 1, 1)
                draw_res(res, -2, 1, 0, yoff)
            end,
        },
        fade = {
            enter = function(progress)
                draw_res(res, -1, progress)
            end,
            exit = function(progress)
                draw_res(res, -2, 1-progress)
            end,
        },
        zoom_out = {
            enter = function(progress)
                progress = easing.outQuint(progress, 0, 1, 1)
                local aspect = WIDTH / HEIGHT
                local extra = WIDTH / 25 * (1-progress)
                draw_res(res, -1, progress,
                    -extra*aspect, -extra,
                     extra*aspect,  extra
                )
            end,
            exit = function(progress)
                progress = easing.outQuint(progress, 0, 1, 1)
                local aspect = WIDTH / HEIGHT
                local extra = WIDTH / 25 * progress
                draw_res(res, -2, 1-progress,
                     extra*aspect,  extra,
                    -extra*aspect, -extra
                )
            end,
        },
        zoom_in = {
            enter = function(progress)
                progress = easing.outQuint(progress, 0, 1, 1)
                local aspect = WIDTH / HEIGHT
                local extra = -WIDTH / 25 * (1-progress)
                draw_res(res, -1, progress,
                    -extra*aspect, -extra,
                     extra*aspect,  extra
                )
            end,
            exit = function(progress)
                progress = easing.outQuint(progress, 0, 1, 1)
                local aspect = WIDTH / HEIGHT
                local extra = -WIDTH / 25 * progress
                draw_res(res, -2, 1-progress,
                     extra*aspect,  extra,
                    -extra*aspect, -extra
                )
            end,
        },
    }

    local function load()
        res = resource.load_video{
            file = file:copy(),
            raw = true,
            looped = true,
            paused = true,
            audio = audio,
        }
    end

    local function ready()
        return res and res:state() ~= "loading"
    end

    local function draw(mode, effect, progress)
        if mode == "exit" then
            res:stop()
        else
            res:start()
        end
        if mode == "play" then
            draw_res(res, -1, 1)
        elseif mode == "load" then
            draw_res(res, -1, 1) -- .95)
        else
            effects[effect][mode](progress)
        end
    end

    local function unload()
        res:dispose()
    end

    return {
        load = load;
        ready = ready;
        draw = draw;
        unload = unload;
        frame_delay = 0;
    }
end

local function Transition(exit_t, enter_t, exit_effect, enter_effect)
    local exit_start, exit_end
    local enter_start, enter_end
    local ends

    local function start(t)
        local max_t = math.max(exit_t, enter_t)
        ends = t + max_t
        exit_start = ends - exit_t
        exit_end = ends
        enter_start = ends - enter_t
        enter_end = ends
    end

    local function progress(t, starts, ends)
        local duration = ends - starts
        local offset = t - starts
        local progress = 1.0 / duration * offset
        return math.max(0, math.min(1, progress))
    end

    return {
        start = start;
        exit_effect = exit_effect;
        exit_progress = function(t)
            return progress(t, exit_start, exit_end)
        end;
        enter_effect = enter_effect;
        enter_progress = function(t)
            return progress(t, enter_start, enter_end)
        end;
        completed = function(t)
            return t >= ends
        end;
    }
end

local function Player()
    local current, next = Image(resource.open_file "empty.png")
    local history = {}
    local pages_by_uuid = {}
    local home, page -- home and current page
    local last_switch = sys.now()

    current.load()

    local function set_pages(new_pages)
        -- create fallback for unconfigured setup
        if #new_pages == 0 then
            new_pages = {{
                name = "Empty dummy",
                uuid = "dummy",
                asset = {
                    asset_name = "fallback.jpg",
                    type = "image",
                },
                duration = 5,
                links = {},
            }}
        end
        -- pin assets
        for i, page in ipairs(new_pages) do
            page.asset.asset = resource.open_file(page.asset.asset_name)
        end

        pages_by_uuid = {}
        for idx, new_page in ipairs(new_pages) do
            pages_by_uuid[new_page.uuid] = new_page
        end
        home = new_pages[1]
        if page then
            page = pages_by_uuid[page.uuid]
        end
        history = {}
    end

    local function transition_to_page(page_uuid, effect, time)
        print("transition init to ", page_uuid, effect, time)
        if page_uuid == "home" then
            history = {}
            page_uuid = home.uuid
        elseif page_uuid == "back" then
            table.remove(history) -- discard current item
            page_uuid = table.remove(history) -- get prev item
            if not page_uuid then
                return
            end
        end
        print("page_uuid is ", page_uuid)

        page = pages_by_uuid[page_uuid] or home
        last_switch = sys.now()
        history[#history+1] = page.uuid

        return {
            player = ({
                image = Image,
                video = Video,
            })[page.asset.type](page.asset.asset),
            exit_effect = effect,
            exit_t = time,
            enter_effect = effect,
            enter_t = time,
        }
    end

    local white = resource.create_colored_texture(1,1,1,1)
    local accept_touch = true

    local function handle_play()
        if not page then
            print "no current page. going back home"
            return transition_to_page(
                home.uuid, "zoom_in",
                TRANSITION_TIME
            )
        end

        if input_state.down then
            if accept_touch then
                local touch_x, touch_y = input_state.x, input_state.y
                print("touch test", touch_x, touch_y)
                for i, link in ipairs(page.links) do
                    if link.type == "touch" and
                       touch_x > link.options.x1 and touch_x < link.options.x2 and
                       touch_y > link.options.y1 and touch_y < link.options.y2 
                    then
                        local switch = transition_to_page(
                            link.target_uuid, link.transition,
                            TRANSITION_TIME
                        )
                        if switch then
                            accept_touch = false
                            return switch
                        end
                   end
                end
            end

            -- for i, link in ipairs(page.links) do
            --     white:draw(target.x1, target.y1, target.x2, target.y2, 0.1)
            -- end
            -- white:draw(touch_x-30, touch_y-30, touch_x+30, touch_y+30, 0.1)
        else
            accept_touch = true
        end

        for i, link in ipairs(page.links) do
            if link.type == "timeout" and
               sys.now() > last_switch + link.options.timeout
            then
                accept_touch = true
                return transition_to_page(
                    link.target_uuid, link.transition,
                    TRANSITION_TIME
                )
           end
       end
    end

    local state = "play"
    local transition

    local function tick()
        if state == "play" then
            current.draw "play"

            local switch = handle_play()
            if switch then
                next = switch.player
                next.load()
                transition = Transition(
                    switch.exit_t,
                    switch.enter_t,
                    switch.exit_effect,
                    switch.enter_effect
                )
                state = "load_next"
            end
        elseif state == "load_next" then
            if next.ready() then
                current.draw "play"
                -- delay by two frames, so the video playback can start without
                -- affecting the transition
                transition.start(sys.now() + 2*frame_delay)
                state = "transition"
            else
                current.draw "load"
            end
        elseif state == "transition" then
            local now = sys.now()
            current.draw("exit",
                transition.exit_effect, 
                transition.exit_progress(now+current.frame_delay)
            )
            next.draw("enter",
                transition.enter_effect, 
                transition.enter_progress(now+next.frame_delay)
            )
            if transition.completed(now) then
                current.unload()
                current = next
                state = "play"
            end
        end
    end

    return {
        tick = tick;
        set_pages = set_pages;
    }
end

local player = Player()

util.data_mapper{
    input = function(raw)
        input_state = json.decode(raw)
        -- coordinates are native screen coordinates and
        -- must be unprojected to the virtual screen space.
        input_state.x, input_state.y = screen.unproject(
            input_state.x, input_state.y
        )
    end
}

util.json_watch("config.json", function(config)
    local w, h = unpack(config.resolution)
    screen.update{
        rotation = config.rotation,
        res_x = w,
        res_y = h,
    }
    audio = config.audio
    player.set_pages(config.pages)
end)

function node.render()
    screen.setup()
    player.tick()
end
