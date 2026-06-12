---
name: haonan-image-whiteboard
version: 1.0.0
description: Turn an idea, report, product concept, workflow, or article into a clean Chinese whiteboard-style visual explainer, then generate a raster image with Codex image generation.
---

# Haonan Image Whiteboard

This is a sanitized project-local Codex skill for generating whiteboard-style visuals. It is included so the idea catcher can produce consistent images without depending on a private local skill installation.

## Privacy Rule

- Do not include private names, account identifiers, local file paths, tokens, keys, watermarks, or personal signatures by default.
- If the project sets `WHITEBOARD_SIGNATURE`, use that exact value as a small unframed handwritten signature in the lower-right corner.
- If `WHITEBOARD_SIGNATURE` is empty, do not add a personal signature.

## When To Use

Use this skill when the user wants a whiteboard sketch, idea diagram, concept explainer, report illustration, product logic diagram, workflow map, comparison chart, knowledge card, mechanism diagram, or article visual.

For Feishu Idea Catcher reports, the image must explain the submitted idea itself. It should not explain the automation pipeline unless the idea is explicitly about that pipeline.

## Core Style

- Language: Chinese unless the source material is explicitly English-only.
- Canvas: clean pure white background.
- Medium: hand-drawn whiteboard marker style.
- Line work: black thin marker strokes, simple icons, arrows, boxes, and labels.
- Accent colors: use blue, green, orange, and red sparingly for hierarchy and contrast.
- Layout: clear information architecture, generous spacing, no clutter.
- Typography: large, readable Chinese text suitable for mobile PDF reading.
- Mood: calm, analytical, practical, and easy to understand.

Avoid photorealistic rendering, glossy UI mockups, complex 3D, dense screenshots, tiny labels, decorative gradients, decorative blobs, and stock-image aesthetics.

## Information Architecture

For a single idea review image, summarize the report into 4-6 visual blocks:

1. `用户`: who has the problem.
2. `痛点`: what hurts, and why it matters.
3. `方案`: the smallest useful product or workflow.
4. `差异化`: why this could still be worth doing.
5. `风险`: the biggest failure path or boundary.
6. `下一步`: one concrete validation action.

The image title must be rewritten into a short product-style title. Do not use the raw long user input as the title.

## Recommended Layouts

Choose one layout based on the content:

- `Four Quadrants`: user, pain, solution, next step.
- `Left-To-Right Workflow`: input, processing, output, feedback.
- `Center Concept Map`: one core idea in the center with 4-5 branches.
- `Problem/Solution Split`: left side pain, right side proposed product.
- `MVP Roadmap`: three steps from manual validation to automation.

## Prompt Skeleton

Use this structure when calling image generation:

```text
生成一张中文白板手绘信息图。

标题：{short_title}

内容目标：
用一张图讲清楚这个想法的内涵，而不是解释自动化系统本身。

画面结构：
- 用户：{target_user}
- 痛点：{pain_point}
- 方案：{solution}
- 差异化：{differentiation}
- 风险：{main_risk}
- 下一步：{next_action}

视觉风格：
白底，黑色手绘线条，蓝绿橙红少量强调，中文大字，手机上可读。
不要密集小字，不要真实照片，不要复杂 UI 截图，不要装饰性渐变。

署名规则：
如果提供 WHITEBOARD_SIGNATURE，则在右下角放一个很小的无边框手写署名。
如果未提供 WHITEBOARD_SIGNATURE，不要添加署名。
```

## Quality Checklist

Before accepting the image, verify:

- The title is short and wraps cleanly.
- The image explains the user idea, not the Feishu/Codex/Obsidian automation pipeline.
- Chinese text is readable on a phone screen.
- There are no private names, keys, URLs, local paths, or accidental watermarks.
- The diagram has a clear flow or grouping.
- The image can stand alone as a summary of the report.

## Output

Return or save a PNG image path. If image generation fails, keep the text report usable and record the image failure clearly.
