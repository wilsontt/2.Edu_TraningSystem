# Tailwind CSS 旋轉角度寫法指南

在 Tailwind CSS 中，使用 `transform` 與 `rotate` 相關的 utility classes 來控制元素的旋轉。

## 1. 順時針旋轉 (Clockwise)
使用正數角度。

*   **語法**：`rotate-{degree}` 或 `rotate-[{value}]`
*   **範例**：
    *   `rotate-12`：預設值，旋轉 12 度。
    *   `rotate-45`：預設值，旋轉 45 度。
    *   `rotate-90`：預設值，旋轉 90 度。
    *   `rotate-[16deg]`：自定義數值，旋轉 16 度（需加單位 `deg`）。

## 2. 逆時針旋轉 (Counter-Clockwise)
在 `rotate` 前面加上負號 `-`。

*   **語法**：`-rotate-{degree}` 或 `-rotate-[{value}]`
*   **範例**：
    *   `-rotate-12`：預設值，逆時針 12 度。
    *   `-rotate-45`：預設值，逆時針 45 度。
    *   `-rotate-[16deg]`：自定義數值，逆時針 16 度。

## 3. 實用範例：印章效果

印章通常會稍微傾斜以模擬自然蓋章的效果。

```tsx
// 順時針 16 度 (向右傾斜)
<div className="transform rotate-[16deg]">
  PASS
</div>

// 逆時針 6 度 (向左微傾，較自然的蓋章角度)
<div className="transform -rotate-6">
  PASS
</div>

// 逆時針 12 度 (向左明顯傾斜)
<div className="transform -rotate-12">
  PASS
</div>
```

## 4. 常用 Tailwind 預設旋轉值

| Class | CSS Property |
| :--- | :--- |
| `rotate-0` | `transform: rotate(0deg);` |
| `rotate-1` | `transform: rotate(1deg);` |
| `rotate-2` | `transform: rotate(2deg);` |
| `rotate-3` | `transform: rotate(3deg);` |
| `rotate-6` | `transform: rotate(6deg);` |
| `rotate-12` | `transform: rotate(12deg);` |
| `rotate-45` | `transform: rotate(45deg);` |
| `rotate-90` | `transform: rotate(90deg);` |
| `rotate-180` | `transform: rotate(180deg);` |

> 註：若需使用任意角度，請使用 JIT 模式寫法 `rotate-[Xdeg]`。

## 小提醒：
若使用 rotate-[...] (自定義數值)，記得加上單位 deg。
若使用 Tailwind 預設值 (如 rotate-12)，則不需要加 [] 和 deg。
通常「合格/通過」印章為了模擬蓋章動作，稍微 逆時針 (-rotate) 傾斜會比較自然。
