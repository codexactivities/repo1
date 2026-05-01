from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN

# Color palette
BG_DARK = RGBColor(0x0F, 0x14, 0x1E)
ACCENT = RGBColor(0xFF, 0x6B, 0x35)
ACCENT2 = RGBColor(0x4E, 0xCD, 0xC4)
TEXT_LIGHT = RGBColor(0xF5, 0xF5, 0xF5)
TEXT_MUTED = RGBColor(0xB0, 0xB8, 0xC4)
CARD = RGBColor(0x1B, 0x23, 0x33)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

BLANK = prs.slide_layouts[6]


def set_bg(slide, color=BG_DARK):
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg.line.fill.background()
    bg.fill.solid()
    bg.fill.fore_color.rgb = color
    bg.shadow.inherit = False
    return bg


def add_text(slide, left, top, width, height, text, size=18, bold=False,
             color=TEXT_LIGHT, align=PP_ALIGN.LEFT, font="Calibri"):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.05)
    tf.margin_right = Inches(0.05)
    lines = text.split("\n") if isinstance(text, str) else text
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        run = p.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = font
    return tb


def add_card(slide, left, top, width, height, color=CARD):
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.adjustments[0] = 0.08
    card.line.fill.background()
    card.fill.solid()
    card.fill.fore_color.rgb = color
    card.shadow.inherit = False
    return card


def add_accent_bar(slide, left, top, width=Inches(0.12), height=Inches(0.6), color=ACCENT):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    bar.line.fill.background()
    bar.fill.solid()
    bar.fill.fore_color.rgb = color
    bar.shadow.inherit = False
    return bar


def slide_header(slide, title, num=None):
    add_accent_bar(slide, Inches(0.5), Inches(0.45), Inches(0.12), Inches(0.55))
    add_text(slide, Inches(0.75), Inches(0.4), Inches(10), Inches(0.7),
             title, size=30, bold=True, color=TEXT_LIGHT)
    if num:
        add_text(slide, Inches(11.5), Inches(0.4), Inches(1.3), Inches(0.7),
                 num, size=28, bold=True, color=ACCENT, align=PP_ALIGN.RIGHT)
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.5), Inches(1.15), Inches(12.3), Pt(1.5))
    line.line.fill.background()
    line.fill.solid()
    line.fill.fore_color.rgb = ACCENT2
    line.shadow.inherit = False


# ======================== SLIDE 1: TITLE ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)

# Decorative shapes
deco = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(-2), Inches(-2), Inches(5), Inches(5))
deco.line.fill.background()
deco.fill.solid()
deco.fill.fore_color.rgb = ACCENT
deco.shadow.inherit = False

deco2 = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(10), Inches(5), Inches(5), Inches(5))
deco2.line.fill.background()
deco2.fill.solid()
deco2.fill.fore_color.rgb = ACCENT2
deco2.shadow.inherit = False

add_text(s, Inches(1), Inches(2.4), Inches(11.5), Inches(1.2),
         "Тёмная сторона промт-инженеринга",
         size=54, bold=True, color=TEXT_LIGHT)
add_text(s, Inches(1), Inches(3.7), Inches(11.5), Inches(0.8),
         "Невероятно эффективные, но малоизвестные техники",
         size=26, color=ACCENT2)
add_text(s, Inches(1), Inches(6.4), Inches(11.5), Inches(0.5),
         "Практическое руководство  ·  2026",
         size=16, color=TEXT_MUTED)

# ======================== SLIDE 2: AGENDA ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Что внутри")

agenda = [
    ("01", "Почему «дай хороший промт» больше не работает"),
    ("02", "Meta-prompting: пусть модель пишет промт сама"),
    ("03", "Self-Consistency и Tree-of-Thought"),
    ("04", "Контрастные пары и негативные примеры"),
    ("05", "Role-Persona-Task-Format (RPTF)"),
    ("06", "Least-to-Most и декомпозиция"),
    ("07", "Скрытые управляющие токены и анкеры"),
    ("08", "Калибровка через self-critique"),
    ("09", "Чек-лист и шпаргалка"),
]

for i, (num, text) in enumerate(agenda):
    col = i % 2
    row = i // 2
    left = Inches(0.7 + col * 6.2)
    top = Inches(1.5 + row * 0.95)
    add_card(s, left, top, Inches(5.9), Inches(0.8))
    add_text(s, left + Inches(0.2), top + Inches(0.18), Inches(0.8), Inches(0.5),
             num, size=20, bold=True, color=ACCENT)
    add_text(s, left + Inches(1.0), top + Inches(0.2), Inches(4.8), Inches(0.5),
             text, size=15, color=TEXT_LIGHT)


# ======================== SLIDE 3: WHY ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Почему обычные промты проваливаются", "01")

points = [
    ("Размытая роль", "«Ты эксперт» — слишком общо. Модель не знает, в чьём стиле отвечать."),
    ("Нет критериев", "Без явных критериев успеха модель оптимизирует поверхностный фит."),
    ("Один проход", "Сложные задачи требуют итерации, а не одного выстрела."),
    ("Скрытые ассоциации", "Случайные слова в промте уводят распределение ответа в сторону."),
]

for i, (title, body) in enumerate(points):
    top = Inches(1.55 + i * 1.35)
    add_card(s, Inches(0.6), top, Inches(12.1), Inches(1.2))
    add_accent_bar(s, Inches(0.6), top, Inches(0.15), Inches(1.2),
                   color=ACCENT if i % 2 == 0 else ACCENT2)
    add_text(s, Inches(1.0), top + Inches(0.18), Inches(11), Inches(0.5),
             title, size=20, bold=True, color=ACCENT2)
    add_text(s, Inches(1.0), top + Inches(0.6), Inches(11.5), Inches(0.6),
             body, size=15, color=TEXT_MUTED)


# ======================== SLIDE 4: META-PROMPTING ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Meta-prompting: модель пишет промт сама", "02")

add_text(s, Inches(0.7), Inches(1.35), Inches(12), Inches(0.6),
         "Идея: вместо того чтобы шлифовать промт руками, попросите модель его улучшить.",
         size=17, color=TEXT_MUTED)

# Left card - bad
add_card(s, Inches(0.6), Inches(2.1), Inches(6), Inches(4.8))
add_text(s, Inches(0.85), Inches(2.25), Inches(5.5), Inches(0.5),
         "Обычный подход", size=18, bold=True, color=ACCENT)
add_text(s, Inches(0.85), Inches(2.85), Inches(5.5), Inches(4),
         "«Напиши статью про SaaS-продажи»\n\n"
         "→ Получаем общий текст\n"
         "→ Правим промт вручную\n"
         "→ 5–10 итераций\n"
         "→ Тратим часы",
         size=15, color=TEXT_LIGHT)

# Right card - meta
add_card(s, Inches(6.8), Inches(2.1), Inches(6), Inches(4.8))
add_text(s, Inches(7.05), Inches(2.25), Inches(5.5), Inches(0.5),
         "Meta-prompt", size=18, bold=True, color=ACCENT2)
add_text(s, Inches(7.05), Inches(2.85), Inches(5.7), Inches(4),
         "«Ты — эксперт по промт-инженерингу.\n"
         "Вот моя задача: [...].\n"
         "Сначала задай мне 5 уточняющих\n"
         "вопросов, затем составь идеальный\n"
         "промт под мою задачу с критериями\n"
         "успеха и форматом вывода.»",
         size=14, color=TEXT_LIGHT)


# ======================== SLIDE 5: SELF-CONSISTENCY / TOT ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Self-Consistency и Tree-of-Thought", "03")

add_text(s, Inches(0.7), Inches(1.35), Inches(12), Inches(0.6),
         "Не доверяйте первому ответу. Сэмплируйте несколько и выбирайте консенсус.",
         size=17, color=TEXT_MUTED)

# Three columns
cols = [
    ("Self-Consistency",
     "Запустите промт N раз с\ntemperature > 0. Возьмите\nответ, встретившийся чаще\nвсего. Точность на матема-\nтике вырастает на 10–20%.",
     ACCENT),
    ("Tree-of-Thought",
     "Модель явно ветвит\nрассуждение: генерирует\n3 гипотезы, оценивает\nкаждую, выбирает лучшую\nи продолжает.",
     ACCENT2),
    ("Когда применять",
     "Логика, математика,\nдиагностика, juridical\nreasoning — везде, где\nцена ошибки выше\nстоимости вызовов.",
     ACCENT),
]

for i, (title, body, color) in enumerate(cols):
    left = Inches(0.6 + i * 4.15)
    add_card(s, left, Inches(2.1), Inches(4), Inches(4.8))
    add_accent_bar(s, left, Inches(2.1), Inches(4), Inches(0.1), color=color)
    add_text(s, left + Inches(0.25), Inches(2.35), Inches(3.6), Inches(0.6),
             title, size=18, bold=True, color=color)
    add_text(s, left + Inches(0.25), Inches(3.05), Inches(3.6), Inches(3.5),
             body, size=14, color=TEXT_LIGHT)


# ======================== SLIDE 6: CONTRASTIVE ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Контрастные пары: показать, как НЕ надо", "04")

add_text(s, Inches(0.7), Inches(1.35), Inches(12), Inches(0.6),
         "Few-shot становится в 2–3 раза эффективнее, если рядом с примером «как надо» есть «как не надо».",
         size=17, color=TEXT_MUTED)

# Bad example
add_card(s, Inches(0.6), Inches(2.2), Inches(6), Inches(4.6))
add_text(s, Inches(0.85), Inches(2.35), Inches(5.5), Inches(0.5),
         "✕ Плохой пример", size=18, bold=True, color=RGBColor(0xE7, 0x4C, 0x3C))
add_text(s, Inches(0.85), Inches(2.95), Inches(5.5), Inches(3.5),
         "Вход: «Объясни рекурсию»\n\n"
         "Выход: «Рекурсия — это когда\n"
         "функция вызывает сама себя.\n"
         "Вот пример на Python...»\n\n"
         "Почему плохо: жаргон сразу,\n"
         "нет аналогии, нет проверки\n"
         "понимания.",
         size=14, color=TEXT_LIGHT)

# Good example
add_card(s, Inches(6.8), Inches(2.2), Inches(6), Inches(4.6))
add_text(s, Inches(7.05), Inches(2.35), Inches(5.5), Inches(0.5),
         "✓ Хороший пример", size=18, bold=True, color=ACCENT2)
add_text(s, Inches(7.05), Inches(2.95), Inches(5.5), Inches(3.5),
         "Вход: «Объясни рекурсию»\n\n"
         "Выход: «Представь матрёшку:\n"
         "открываешь — внутри такая же,\n"
         "но меньше. Открываешь её —\n"
         "снова такая же. Так и функция…»\n\n"
         "Затем: код + вопрос на проверку.",
         size=14, color=TEXT_LIGHT)


# ======================== SLIDE 7: RPTF ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Role · Persona · Task · Format", "05")

add_text(s, Inches(0.7), Inches(1.35), Inches(12), Inches(0.6),
         "Каркас, который превращает любой запрос в воспроизводимый промт.",
         size=17, color=TEXT_MUTED)

blocks = [
    ("R — Role", "Кто отвечает: домен, опыт, специализация.", ACCENT),
    ("P — Persona", "Стиль и тон: для кого пишем, какой регистр.", ACCENT2),
    ("T — Task", "Точная задача с критериями успеха и ограничениями.", ACCENT),
    ("F — Format", "Жёсткий формат вывода: JSON, таблица, секции.", ACCENT2),
]

for i, (title, body, color) in enumerate(blocks):
    col = i % 2
    row = i // 2
    left = Inches(0.6 + col * 6.2)
    top = Inches(2.0 + row * 2.4)
    add_card(s, left, top, Inches(6), Inches(2.1))
    add_text(s, left + Inches(0.3), top + Inches(0.2), Inches(5.5), Inches(0.6),
             title, size=22, bold=True, color=color)
    add_text(s, left + Inches(0.3), top + Inches(0.95), Inches(5.5), Inches(1.1),
             body, size=15, color=TEXT_LIGHT)


# ======================== SLIDE 8: LEAST-TO-MOST ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Least-to-Most: декомпозиция вместо штурма", "06")

add_text(s, Inches(0.7), Inches(1.35), Inches(12), Inches(0.6),
         "Сначала просим модель разбить задачу на под-задачи. Затем решаем каждую отдельно.",
         size=17, color=TEXT_MUTED)

steps = [
    ("Шаг 1", "Разложить", "«Перечисли под-задачи,\nкоторые нужно решить.»"),
    ("Шаг 2", "Решить", "Для каждой под-задачи —\nотдельный фокусированный\nпромт."),
    ("Шаг 3", "Собрать", "Объединить ответы и\nпопросить модель проверить\nконсистентность."),
]

for i, (label, title, body) in enumerate(steps):
    left = Inches(0.6 + i * 4.15)
    add_card(s, left, Inches(2.2), Inches(4), Inches(4.6))
    add_text(s, left + Inches(0.3), Inches(2.4), Inches(3.5), Inches(0.5),
             label, size=14, bold=True, color=ACCENT)
    add_text(s, left + Inches(0.3), Inches(2.9), Inches(3.5), Inches(0.6),
             title, size=22, bold=True, color=TEXT_LIGHT)
    add_text(s, left + Inches(0.3), Inches(3.7), Inches(3.5), Inches(2.8),
             body, size=14, color=TEXT_MUTED)
    if i < 2:
        arrow = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW,
                                    Inches(4.5 + i * 4.15), Inches(4.2),
                                    Inches(0.4), Inches(0.4))
        arrow.line.fill.background()
        arrow.fill.solid()
        arrow.fill.fore_color.rgb = ACCENT2
        arrow.shadow.inherit = False


# ======================== SLIDE 9: CONTROL TOKENS ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Скрытые управляющие анкеры", "07")

add_text(s, Inches(0.7), Inches(1.35), Inches(12.2), Inches(0.6),
         "Малоизвестный приём: использовать XML-теги и якорные фразы как «ручки» для модели.",
         size=17, color=TEXT_MUTED)

tips = [
    ("<context>…</context>", "Изолируйте входные данные от инструкций — модель перестаёт путать их."),
    ("<thinking>…</thinking>", "Зарезервированное место для рассуждений, которое можно потом скрыть от пользователя."),
    ("«Подумай шаг за шагом, прежде чем отвечать»", "Классический CoT-якорь — даёт +5–15% точности на reasoning-бенчмарках."),
    ("«Если не уверен — скажи I don't know»", "Снижает галлюцинации на фактологических задачах в 2–3 раза."),
]

for i, (code, body) in enumerate(tips):
    top = Inches(2.05 + i * 1.2)
    add_card(s, Inches(0.6), top, Inches(12.1), Inches(1.05))
    add_text(s, Inches(0.85), top + Inches(0.13), Inches(5.5), Inches(0.5),
             code, size=15, bold=True, color=ACCENT2, font="Consolas")
    add_text(s, Inches(0.85), top + Inches(0.55), Inches(11.5), Inches(0.5),
             body, size=14, color=TEXT_LIGHT)


# ======================== SLIDE 10: SELF-CRITIQUE ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Self-Critique: модель сама себе редактор", "08")

add_text(s, Inches(0.7), Inches(1.35), Inches(12.2), Inches(0.6),
         "Двухпроходная схема даёт результат сравнимый с GPT-уровнем выше — без смены модели.",
         size=17, color=TEXT_MUTED)

phases = [
    ("Проход 1", "Generate",
     "Обычный ответ\nна задачу без\nсамокритики.", ACCENT),
    ("Проход 2", "Critique",
     "«Найди 3 слабости\nв своём ответе.\nБудь беспощаден.»", ACCENT2),
    ("Проход 3", "Revise",
     "«Перепиши ответ,\nустранив все\nнайденные слабости.»", ACCENT),
]

for i, (label, title, body, color) in enumerate(phases):
    left = Inches(0.6 + i * 4.15)
    add_card(s, left, Inches(2.2), Inches(4), Inches(4.6))
    add_accent_bar(s, left, Inches(2.2), Inches(4), Inches(0.12), color=color)
    add_text(s, left + Inches(0.3), Inches(2.5), Inches(3.5), Inches(0.5),
             label, size=14, bold=True, color=color)
    add_text(s, left + Inches(0.3), Inches(3.0), Inches(3.5), Inches(0.7),
             title, size=24, bold=True, color=TEXT_LIGHT)
    add_text(s, left + Inches(0.3), Inches(3.9), Inches(3.5), Inches(2.5),
             body, size=15, color=TEXT_MUTED)


# ======================== SLIDE 11: CHEATSHEET ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)
slide_header(s, "Чек-лист на каждый день", "09")

checks = [
    "Используйте каркас RPTF (Role · Persona · Task · Format)",
    "Просите модель сначала задать уточняющие вопросы",
    "Изолируйте данные XML-тегами <context>, <example>, <thinking>",
    "Для логики — Self-Consistency: 3–5 сэмплов с temperature 0.7",
    "Для творчества — контрастные пары «как надо / как не надо»",
    "Сложные задачи бейте Least-to-Most на под-задачи",
    "Финальный проход — Self-Critique: найди 3 слабости и перепиши",
    "Явно разрешайте «I don't know» — это снижает галлюцинации",
]

for i, item in enumerate(checks):
    col = i % 2
    row = i // 2
    left = Inches(0.6 + col * 6.2)
    top = Inches(1.55 + row * 1.25)
    add_card(s, left, top, Inches(6), Inches(1.05))
    # checkmark circle
    circle = s.shapes.add_shape(MSO_SHAPE.OVAL, left + Inches(0.25), top + Inches(0.3),
                                 Inches(0.5), Inches(0.5))
    circle.line.fill.background()
    circle.fill.solid()
    circle.fill.fore_color.rgb = ACCENT2
    circle.shadow.inherit = False
    add_text(s, left + Inches(0.28), top + Inches(0.28), Inches(0.5), Inches(0.5),
             "✓", size=22, bold=True, color=BG_DARK, align=PP_ALIGN.CENTER)
    add_text(s, left + Inches(0.95), top + Inches(0.28), Inches(5), Inches(0.6),
             item, size=13, color=TEXT_LIGHT)


# ======================== SLIDE 12: CLOSING ========================
s = prs.slides.add_slide(BLANK)
set_bg(s)

deco = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(9), Inches(-2), Inches(7), Inches(7))
deco.line.fill.background()
deco.fill.solid()
deco.fill.fore_color.rgb = ACCENT
deco.shadow.inherit = False

add_text(s, Inches(0.8), Inches(2.6), Inches(11), Inches(1.2),
         "Промт — это интерфейс к модели",
         size=48, bold=True, color=TEXT_LIGHT)
add_text(s, Inches(0.8), Inches(3.9), Inches(11), Inches(0.8),
         "Чем точнее интерфейс — тем мощнее результат.",
         size=22, color=ACCENT2)
add_text(s, Inches(0.8), Inches(5.0), Inches(11), Inches(0.6),
         "Спасибо. Вопросы?",
         size=20, color=TEXT_MUTED)


prs.save("/home/user/repo1/prompt_engineering_techniques.pptx")
print("Saved")
