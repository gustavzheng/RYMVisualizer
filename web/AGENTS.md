# Project change discipline

- Follow the user's requested scope literally. Do not add, remove, restyle, cap, reorder, or reinterpret anything that was not requested.
- Before changing layout, identify the exact element the user named. A request to widen a container must change that container's width; it must not be simulated by shrinking its contents.
- Never introduce arbitrary item limits. When the user says a region should be filled, derive capacity from the rendered region or allow overflow/clipping without truncating the source collection.
- Do not add borders, shadows, decorative treatments, colors, controls, copy, or interactions unless the request requires them.
- Preserve existing dimensions and visual treatments unless the user explicitly requests changing them.
- When a phrase has more than one plausible interpretation and the interpretations materially change layout or behavior, inspect the surrounding implementation and reference first. Ask only if it remains ambiguous.
- For reference implementations, reproduce the relevant behavior and interaction model faithfully before adapting styling.
- Report exactly what changed. Do not describe a partial or approximate implementation as complete.
