"""Build a high-density, practical prompt engineering presentation."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

# Palette
BG = RGBColor(0x0E, 0x12, 0x1B)
PANEL = RGBColor(0x18, 0x1F, 0x2E)
PANEL2 = RGBColor(0x22, 0x2B, 0x3D)
ACCENT = RGBColor(0xFF, 0x7A, 0x3D)        # warm orange
ACCENT2 = RGBColor(0x4E, 0xCD, 0xC4)       # teal
GOOD = RGBColor(0x6E, 0xE7, 0xB7)
BAD = RGBColor(0xE8, 0x6A, 0x6A)
TEXT = RGBColor(0xF2, 0xF4, 0xF8)
MUTED = RGBColor(0x9A, 0xA4, 0xB8)
CODE_BG = RGBColor(0x0A, 0x0E, 0x16)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


def bg(slide, color=BG):
    r = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    r.line.fill.background()
    r.fill.solid()
    r.fill.fore_color.rgb = color
    r.shadow.inherit = False
    return r


def card(slide, left, top, width, height, color=PANEL, radius=0.06):
    c = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    c.adjustments[0] = radius
    c.line.fill.background()
    c.fill.solid()
    c.fill.fore_color.rgb = color
    c.shadow.inherit = False
    return c


def bar(slide, left, top, width, height, color=ACCENT):
    b = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    b.line.fill.background()
    b.fill.solid()
    b.fill.fore_color.rgb = color
    b.shadow.inherit = False
    return b


def text(slide, left, top, width, height, content, *,
         size=16, bold=False, color=TEXT, align=PP_ALIGN.LEFT,
         font="Calibri", anchor=MSO_ANCHOR.TOP, line_spacing=1.15):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.08)
    tf.margin_right = Inches(0.08)
    tf.margin_top = Inches(0.04)
    tf.margin_bottom = Inches(0.04)
    tf.vertical_anchor = anchor
    lines = content.split("\n") if isinstance(content, str) else content
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        run = p.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = font
    return tb


def header(slide, title, num=None):
    bar(slide, Inches(0.5), Inches(0.45), Inches(0.14), Inches(0.55), ACCENT)
    text(slide, Inches(0.78), Inches(0.38), Inches(10.4), Inches(0.7),
         title, size=28, bold=True, color=TEXT, anchor=MSO_ANCHOR.MIDDLE)
    if num:
        text(slide, Inches(11.3), Inches(0.38), Inches(1.55), Inches(0.7),
             num, size=22, bold=True, color=ACCENT, align=PP_ALIGN.RIGHT,
             anchor=MSO_ANCHOR.MIDDLE)
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                   Inches(0.5), Inches(1.18),
                                   Inches(12.3), Emu(12700))
    line.line.fill.background()
    line.fill.solid()
    line.fill.fore_color.rgb = ACCENT2
    line.shadow.inherit = False


def code_box(slide, left, top, width, height, content, *, label=None,
             label_color=ACCENT2, size=12):
    card(slide, left, top, width, height, color=CODE_BG, radius=0.04)
    inner_top = top + Inches(0.15)
    if label:
        text(slide, left + Inches(0.2), top + Inches(0.08),
             width - Inches(0.4), Inches(0.3),
             label, size=11, bold=True, color=label_color, font="Consolas")
        inner_top = top + Inches(0.42)
    text(slide, left + Inches(0.2), inner_top,
         width - Inches(0.4), height - (inner_top - top) - Inches(0.1),
         content, size=size, color=TEXT, font="Consolas", line_spacing=1.2)


# ============================================================
# SLIDE 1 — TITLE
# ============================================================
s = prs.slides.add_slide(BLANK)
bg(s)

# big abstract decoration
o1 = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(-3), Inches(-3), Inches(7), Inches(7))
o1.line.fill.background(); o1.fill.solid(); o1.fill.fore_color.rgb = ACCENT
o1.shadow.inherit = False
o2 = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(10.5), Inches(4.5), Inches(6), Inches(6))
o2.line.fill.background(); o2.fill.solid(); o2.fill.fore_color.rgb = ACCENT2
o2.shadow.inherit = False
o3 = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(2), Inches(5), Inches(2.5), Inches(2.5))
o3.line.fill.background(); o3.fill.solid(); o3.fill.fore_color.rgb = PANEL2
o3.shadow.inherit = False

text(s, Inches(0.9), Inches(2.1), Inches(11.5), Inches(0.5),
     "PROMPT ENGINEERING", size=16, bold=True, color=ACCENT2)
text(s, Inches(0.9), Inches(2.6), Inches(11.5), Inches(1.6),
     "Малоизвестные техники,\nкоторые реально работают",
     size=46, bold=True, color=TEXT, line_spacing=1.05)
text(s, Inches(0.9), Inches(5.1), Inches(11.5), Inches(0.6),
     "12 приёмов с примерами «до / после» и объяснением, почему они работают",
     size=18, color=MUTED)
text(s, Inches(0.9), Inches(6.6), Inches(11.5), Inches(0.4),
     "2026", size=13, color=MUTED)


# ============================================================
# SLIDE 2 — TOC
# ============================================================
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "Содержание")

items = [
    ("01", "Prefilling", "Начните ответ за модель"),
    ("02", "Recency anchoring", "Главное — в конец промта"),
    ("03", "Re-read", "Заставьте модель перечитать задачу"),
    ("04", "Quantity → Quality", "20 идей, потом топ-3"),
    ("05", "Anti-sycophancy", "Отключаем подхалимство"),
    ("06", "Structured XML", "Теги вместо тройных кавычек"),
    ("07", "Negative few-shot", "Покажите, как НЕ надо"),
    ("08", "Chain of Density", "Сжатие без потерь"),
    ("09", "Self-ask", "Декомпозиция на под-вопросы"),
    ("10", "Reverse prompting", "Реверс-инжиниринг идеала"),
    ("11", "Explicit uncertainty", "Разрешите «не знаю»"),
    ("12", "Temperature по задаче", "0 — извлечение, 0.7 — идеи"),
]
for i, (n, name, desc) in enumerate(items):
    col = i % 3
    row = i // 3
    left = Inches(0.55 + col * 4.18)
    top = Inches(1.45 + row * 1.42)
    card(s, left, top, Inches(4.0), Inches(1.25))
    text(s, left + Inches(0.25), top + Inches(0.15), Inches(1.2), Inches(0.4),
         n, size=14, bold=True, color=ACCENT)
    text(s, left + Inches(0.25), top + Inches(0.45), Inches(3.6), Inches(0.45),
         name, size=16, bold=True, color=TEXT)
    text(s, left + Inches(0.25), top + Inches(0.78), Inches(3.6), Inches(0.45),
         desc, size=12, color=MUTED)


# ============================================================
# Helper for technique slides: title + why-it-works + before/after code
# ============================================================
def technique_slide(num, title, hook, why, before, after,
                    before_label="✕ обычный промт",
                    after_label="✓ улучшенный промт"):
    s = prs.slides.add_slide(BLANK)
    bg(s)
    header(s, title, num)

    # Hook (one-liner takeaway)
    text(s, Inches(0.55), Inches(1.32), Inches(12.3), Inches(0.5),
         hook, size=16, color=ACCENT2, bold=True)

    # Why-it-works strip
    card(s, Inches(0.55), Inches(1.85), Inches(12.3), Inches(0.85), PANEL2)
    text(s, Inches(0.8), Inches(1.92), Inches(0.9), Inches(0.7),
         "ПОЧЕМУ", size=11, bold=True, color=ACCENT,
         anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(1.85), Inches(1.92), Inches(10.8), Inches(0.7),
         why, size=14, color=TEXT, anchor=MSO_ANCHOR.MIDDLE)

    # Before
    code_box(s, Inches(0.55), Inches(2.95), Inches(6.05), Inches(4.3),
             before, label=before_label, label_color=BAD, size=12)
    # After
    code_box(s, Inches(6.73), Inches(2.95), Inches(6.07), Inches(4.3),
             after, label=after_label, label_color=GOOD, size=12)
    return s


# ============================================================
# SLIDE 3 — PREFILLING
# ============================================================
technique_slide(
    "01",
    "Prefilling: начните ответ за модель",
    "Один из самых недооценённых трюков. Работает в Claude API, OpenAI (через assistant prefix), локальных моделях.",
    "Модель продолжает паттерн. Если вы начали ответ с «{», она продолжит JSON. Если с «1.» — продолжит список. Преамбулы и оправдания исчезают.",
    'user: "Извлеки имя и email из текста. Верни JSON."\n'
    "user: <text>...</text>\n\n"
    "→ assistant:\n"
    "  Конечно! Вот извлечённые данные\n"
    "  в формате JSON:\n"
    "  ```json\n"
    '  {"name": "...", "email": "..."}\n'
    "  ```",
    'user: "Извлеки имя и email. Верни JSON."\n'
    "user: <text>...</text>\n"
    "assistant: {\n\n"
    "→ модель продолжает:\n"
    '  "name": "Анна Петрова",\n'
    '  "email": "anna@example.com"\n'
    "  }\n\n"
    "Без болтовни. Парсится сразу.",
)


# ============================================================
# SLIDE 4 — RECENCY ANCHORING
# ============================================================
technique_slide(
    "02",
    "Recency anchoring: главное — в конец",
    "В длинном промте модель сильнее всего «слышит» последние инструкции.",
    "У трансформеров recency bias: при длинном контексте середина теряется (lost-in-the-middle). Последние токены влияют на ответ непропорционально сильно.",
    "[2000 токенов системного промта]\n"
    "[10 примеров few-shot]\n"
    "[документ на 5000 токенов]\n\n"
    "В системе сказано:\n"
    '"Отвечай только на русском, ≤ 200 слов."\n\n'
    "→ Модель отвечает на английском\n"
    "  и пишет 600 слов. Инструкция\n"
    "  утонула в начале.",
    "[2000 токенов системного промта]\n"
    "[10 примеров few-shot]\n"
    "[документ на 5000 токенов]\n\n"
    "В САМОМ КОНЦЕ user-сообщения:\n"
    '"Напомню ключевые правила:\n'
    " 1) только русский язык\n"
    ' 2) не более 200 слов."\n\n'
    "→ Соблюдает оба правила.",
)


# ============================================================
# SLIDE 5 — RE-READ
# ============================================================
technique_slide(
    "03",
    "Re-read: заставьте модель перечитать задачу",
    "Добавление одной фразы повышает точность на reasoning-задачах на 5–15% (исследование Re2, 2023).",
    "Модель «переосмысливает» условия после генерации внутреннего плана и реже теряет ограничения. Стоит 0 токенов на стороне разработчика.",
    "Реши задачу:\n\n"
    "У Анны 12 яблок. Она отдала\n"
    "треть Борису, затем половину\n"
    "оставшегося — Вере. Сколько\n"
    "осталось у Анны?\n\n"
    "→ модель часто теряет один из\n"
    "  шагов или путает доли.",
    "Реши задачу:\n\n"
    "У Анны 12 яблок. Она отдала\n"
    "треть Борису, затем половину\n"
    "оставшегося — Вере. Сколько\n"
    "осталось у Анны?\n\n"
    "Перечитай условие ещё раз,\n"
    "затем реши пошагово.\n\n"
    "→ устойчиво даёт правильный 4.",
)


# ============================================================
# SLIDE 6 — QUANTITY → QUALITY
# ============================================================
technique_slide(
    "04",
    "Quantity → Quality: 20 идей, потом топ-3",
    "Просьба «дай лучшую идею» приводит к среднему. Просьба «дай 20» открывает хвост распределения.",
    "Первые 3–5 идей — клише из обучающих данных. Идеи 10–20 — там, где живёт оригинальность. Затем модель сама фильтрует.",
    'Дай нейминг для приложения\nдля медитации.\n\n'
    "→ Calm, Zen, Mindful, Serenity,\n"
    "  Tranquil...\n\n"
    "  Все варианты — generic.\n"
    "  Уже заняты или скучны.",
    "Сгенерируй 20 названий для\n"
    "приложения для медитации.\n"
    "Будь готов к странным.\n\n"
    "Затем оцени их по\n"
    "запоминаемости (1–10) и\n"
    "выбери 3 лучших с обоснованием.\n\n"
    "→ среди 20 находятся реально\n"
    "  свежие варианты.",
)


# ============================================================
# SLIDE 7 — ANTI-SYCOPHANCY
# ============================================================
technique_slide(
    "05",
    "Anti-sycophancy: отключаем подхалимство",
    "Модели обучены быть приятными. Это превращает их в плохих критиков вашей работы.",
    "RLHF поощряет согласие с пользователем. Явное разрешение «жёсткой обратной связи» и анонимизация авторства возвращают честность.",
    "Вот мой бизнес-план.\n"
    "Что думаешь?\n\n"
    "→ «Отличная идея! Сильные\n"
    "  стороны: ... Несколько\n"
    "  небольших замечаний...»\n\n"
    "  Модель сглаживает реальные\n"
    "  риски, чтобы вас не расстроить.",
    "Ниже — бизнес-план,\n"
    "написанный НЕ мной.\n"
    "Я инвестор, и мне нужна\n"
    "беспощадная оценка.\n"
    "Найди 5 причин, почему\n"
    "это провалится. Никаких\n"
    "комплиментов и хеджирования.\n\n"
    "→ конкретные риски без воды.",
)


# ============================================================
# SLIDE 8 — STRUCTURED XML
# ============================================================
technique_slide(
    "06",
    "XML-теги вместо тройных кавычек",
    "Anthropic и OpenAI оба явно рекомендуют XML. Кавычки и markdown ломаются на вложенности.",
    "Модели обучены на коде и HTML — теги для них естественные разделители. На длинных промтах точность извлечения данных растёт на 10–20%.",
    "Вот документ:\n"
    '"""\n'
    "Длинный текст с цитатами\n"
    "и кавычками внутри...\n"
    '"""\n\n'
    "Ответь на вопрос: ...\n\n"
    "→ модель путает, где кончается\n"
    "  документ. Иногда «отвечает»\n"
    "  на инструкции из документа\n"
    "  (prompt injection).",
    "<document>\n"
    "Длинный текст с цитатами\n"
    "и кавычками внутри...\n"
    "</document>\n\n"
    "<question>...</question>\n\n"
    "<instructions>\n"
    "Сначала найди релевантные\n"
    "цитаты в <quotes>, затем дай\n"
    "ответ в <answer>.\n"
    "</instructions>",
)


# ============================================================
# SLIDE 9 — NEGATIVE FEW-SHOT
# ============================================================
technique_slide(
    "07",
    "Negative few-shot: покажите, как НЕ надо",
    "Один негативный пример с пометкой стоит трёх позитивных.",
    "Модель учится границе между классами, а не центром. Контраст «вот так — нет, а вот так — да» сужает пространство допустимых ответов.",
    "Few-shot:\n"
    "Пример 1: [хороший заголовок]\n"
    "Пример 2: [хороший заголовок]\n"
    "Пример 3: [хороший заголовок]\n\n"
    "Напиши заголовок для статьи\n"
    "про X.\n\n"
    "→ модель повторяет стиль, но\n"
    "  иногда уходит в кликбейт или\n"
    "  слишком сухо.",
    "<bad>\n"
    '"10 шокирующих фактов..."\n'
    "— причина: кликбейт\n"
    "</bad>\n"
    "<bad>\n"
    '"Анализ рынка СRM 2024"\n'
    "— причина: скучно\n"
    "</bad>\n"
    "<good>\n"
    '"Почему ваш CRM теряет 30%\n'
    'лидов и как это починить"\n'
    "</good>",
)


# ============================================================
# SLIDE 10 — CHAIN OF DENSITY
# ============================================================
technique_slide(
    "08",
    "Chain of Density: сжатие без потерь",
    "Техника от Salesforce/MIT (2023). Краткие саммари становятся плотнее с каждой итерацией.",
    "Модель пишет саммари, затем добавляет 1–3 пропущенных «сущности» БЕЗ увеличения длины. За 5 итераций плотность информации удваивается.",
    "Сделай краткое резюме статьи\nна 80 слов.\n\n"
    "→ Получаем поверхностное\n"
    "  изложение — упомянуты только\n"
    "  главные тезисы, цифры и имена\n"
    "  потеряны.",
    "Шаг 1: Напиши саммари (80 слов).\n"
    "Шаг 2: Перечисли 1–3 важные\n"
    "       сущности, которых там нет.\n"
    "Шаг 3: Перепиши саммари тем\n"
    "       же объёмом, включив их.\n"
    "Повтори шаги 2–3 пять раз.\n\n"
    "→ финальное саммари плотное,\n"
    "  без воды, со всеми ключевыми\n"
    "  фактами.",
)


# ============================================================
# SLIDE 11 — SELF-ASK
# ============================================================
technique_slide(
    "09",
    "Self-ask: декомпозиция на под-вопросы",
    "Сильнее обычного Chain-of-Thought на multi-hop вопросах (исследование Press et al., 2022).",
    "Модель явно генерирует под-вопросы и отвечает на каждый. Это форсирует промежуточную верификацию и снижает галлюцинации.",
    "В каком веке родился человек,\n"
    "написавший «Войну и мир»?\n\n"
    "→ модель может сразу выдать\n"
    "  ответ, иногда ошибочный\n"
    "  (особенно на менее известных\n"
    "  фактах).",
    "Вопрос: В каком веке родился\n"
    "автор «Войны и мира»?\n\n"
    "Прежде чем ответить, задай\n"
    "себе под-вопросы и ответь\n"
    "на каждый:\n"
    "Q1: Кто автор? → ...\n"
    "Q2: Когда родился? → ...\n"
    "Q3: Какой это век? → ...\n"
    "Финальный ответ: ...",
)


# ============================================================
# SLIDE 12 — REVERSE PROMPTING
# ============================================================
technique_slide(
    "10",
    "Reverse prompting: реверс-инжиниринг",
    "Покажите модели идеальный результат — попросите вывести промт. Затем используйте этот промт.",
    "Модель — лучший эксперт по самой себе. Она знает, на какие формулировки реагирует. Один из самых быстрых способов получить рабочий промт.",
    'Долго пишете промт:\n"Ты — копирайтер.\nНапиши пост для LinkedIn..."\n\n'
    "→ десятки итераций, ручная\n"
    "  настройка тона и длины,\n"
    "  пока результат не понравится.",
    "Вот пост из LinkedIn,\n"
    "который мне нравится:\n"
    "<example>...</example>\n\n"
    "Какой системный промт мог бы\n"
    "заставить языковую модель\n"
    "стабильно писать в этом стиле?\n"
    "Будь конкретен: тон, структура,\n"
    "длина, риторические приёмы.\n\n"
    "→ получаете готовый промт,\n"
    "  откалиброванный под образец.",
)


# ============================================================
# SLIDE 13 — EXPLICIT UNCERTAINTY
# ============================================================
technique_slide(
    "11",
    "Explicit uncertainty: разрешите «не знаю»",
    "Одна фраза снижает галлюцинации в 2–3 раза на фактологических задачах.",
    "По умолчанию модель оптимизирует «дать ответ». Явное разрешение неопределённости делает «I don't know» допустимой стратегией.",
    "В каком году компания Acme\n"
    "Corp была основана?\n\n"
    "→ модель уверенно выдумывает\n"
    "  год, если не знает. Звучит\n"
    "  правдоподобно — самая\n"
    "  опасная форма галлюцинации.",
    "В каком году была основана\n"
    "Acme Corp?\n\n"
    'Если не уверен — ответь "не\n'
    'знаю" и объясни, что именно\n'
    "тебе мешает ответить точно\n"
    "(нет данных / противоречивые\n"
    "источники / неоднозначное имя).\n\n"
    "→ честный ответ или указание\n"
    "  на конкретный пробел.",
)


# ============================================================
# SLIDE 14 — TEMPERATURE
# ============================================================
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "Temperature под задачу", "12")

text(s, Inches(0.55), Inches(1.32), Inches(12.3), Inches(0.5),
     "Главный параметр, который большинство оставляют по умолчанию. А зря.",
     size=16, color=ACCENT2, bold=True)

rows = [
    ("0.0", "Извлечение, парсинг, классификация", "Детерминированно. Если запросить дважды — получите тот же ответ.", ACCENT2),
    ("0.2 – 0.4", "Код, SQL, технические ответы", "Фокус на корректность, минимум вариативности.", ACCENT2),
    ("0.7", "Письма, копирайтинг, объяснения", "Дефолт. Баланс между точностью и живостью.", ACCENT),
    ("0.9 – 1.2", "Брейнсторм, нейминг, креатив", "Хвост распределения. Хорошо в связке с «дай 20 вариантов».", ACCENT),
    ("> 1.3", "Только эксперименты", "Связность падает. Используйте top_p вместо.", BAD),
]
for i, (t, use, why, color) in enumerate(rows):
    top = Inches(2.0 + i * 1.02)
    card(s, Inches(0.55), top, Inches(12.3), Inches(0.92))
    bar(s, Inches(0.55), top, Inches(0.14), Inches(0.92), color)
    text(s, Inches(0.85), top + Inches(0.1), Inches(1.6), Inches(0.75),
         t, size=20, bold=True, color=color, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(2.6), top + Inches(0.08), Inches(4.4), Inches(0.4),
         use, size=14, bold=True, color=TEXT)
    text(s, Inches(2.6), top + Inches(0.45), Inches(9.8), Inches(0.45),
         why, size=12, color=MUTED)


# ============================================================
# SLIDE 15 — CHEATSHEET / COMBO
# ============================================================
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "Боевая комбинация: всё вместе")

text(s, Inches(0.55), Inches(1.32), Inches(12.3), Inches(0.5),
     "Один промт, который использует 7 техник из этой презентации.",
     size=16, color=ACCENT2, bold=True)

code_box(s, Inches(0.55), Inches(1.95), Inches(8.1), Inches(5.3),
         "<role>\n"
         "Ты — senior product analyst. Ты\n"
         "пишешь для C-level. Краткость и\n"
         "цифры важнее красноречия.\n"
         "</role>\n\n"
         "<data>{ ... сырые метрики ... }</data>\n\n"
         "<task>\n"
         "Найди 3 главные аномалии за\n"
         "квартал. Если данные\n"
         "противоречат друг другу — скажи\n"
         '"данные противоречивы" вместо\n'
         "догадки.\n\n"
         "Перед ответом: перечитай <data>\n"
         "и составь 3 под-вопроса.\n"
         "Ответь на каждый, затем дай\n"
         "финальный ответ.\n"
         "</task>\n\n"
         "<format>JSON по схеме ниже.</format>\n\n"
         "assistant: {\n"
         '  "sub_questions": [',
         label="combined-prompt", label_color=GOOD, size=11)

# Right side: which techniques
techniques_used = [
    ("XML-теги", "<role>, <data>, <task>"),
    ("Anti-sycophancy", "«пишешь для C-level, краткость»"),
    ("Recency anchoring", "правила в конце <task>"),
    ("Explicit uncertainty", "«данные противоречивы»"),
    ("Re-read", "«перечитай <data>»"),
    ("Self-ask", "«составь 3 под-вопроса»"),
    ("Prefilling", 'assistant: { "sub_questions": ['),
]
for i, (name, where) in enumerate(techniques_used):
    top = Inches(1.95 + i * 0.74)
    card(s, Inches(8.85), top, Inches(4.0), Inches(0.66), PANEL2)
    bar(s, Inches(8.85), top, Inches(0.08), Inches(0.66), ACCENT)
    text(s, Inches(9.05), top + Inches(0.05), Inches(3.8), Inches(0.3),
         name, size=12, bold=True, color=ACCENT2)
    text(s, Inches(9.05), top + Inches(0.32), Inches(3.8), Inches(0.3),
         where, size=10, color=MUTED, font="Consolas")


# ============================================================
# SLIDE 16 — CLOSING
# ============================================================
s = prs.slides.add_slide(BLANK)
bg(s)
o = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(8.5), Inches(-2.5), Inches(8), Inches(8))
o.line.fill.background(); o.fill.solid(); o.fill.fore_color.rgb = ACCENT
o.shadow.inherit = False

text(s, Inches(0.8), Inches(2.3), Inches(11), Inches(0.5),
     "ГЛАВНОЕ", size=14, bold=True, color=ACCENT2)
text(s, Inches(0.8), Inches(2.85), Inches(11), Inches(2.0),
     "Маленькие фразы дают\nбольшие сдвиги",
     size=46, bold=True, color=TEXT, line_spacing=1.05)
text(s, Inches(0.8), Inches(4.85), Inches(11), Inches(0.5),
     '«Перечитай условие», «не уверен — скажи не знаю»,',
     size=16, color=MUTED)
text(s, Inches(0.8), Inches(5.2), Inches(11), Inches(0.5),
     "<tags>, prefill — это инженерные ручки, а не магия.",
     size=16, color=MUTED)
text(s, Inches(0.8), Inches(6.3), Inches(11), Inches(0.5),
     "Спасибо. Вопросы?", size=20, color=ACCENT, bold=True)

prs.save("/home/user/repo1/prompt_engineering_techniques.pptx")
print(f"Saved: {len(prs.slides)} slides")
