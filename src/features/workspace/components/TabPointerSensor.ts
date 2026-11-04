import type { PointerSensorOptions, SensorProps } from '@dnd-kit/core';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface TabPointerOptions extends PointerSensorOptions {
    onPosition: (point: { x: number; y: number }) => void;
}

// 指针捕获使鼠标移出窗口后的松手仍可被监听，用于拖出独立窗口。
// 只处理系统 pointercancel，不注册 Esc 或失焦取消拖拽。
export default class TabPointerSensor {
    static activators = [
        {
            eventName: 'onPointerDown' as const,
            // 关闭按钮保留点击语义，只有主指针的左键可以发起标签拖拽。
            handler: ({ nativeEvent: event }: ReactPointerEvent) =>
                event.isPrimary &&
                event.button === 0 &&
                !(event.target as HTMLElement).closest('button, .ant-tabs-tab-remove'),
        },
    ];

    autoScrollEnabled = true;
    private readonly document: Document;
    private readonly target: HTMLElement;
    private readonly event: PointerEvent;
    private readonly props: SensorProps<TabPointerOptions>;
    private activated = false;

    constructor(props: SensorProps<TabPointerOptions>) {
        this.props = props;
        this.event = props.event as PointerEvent;
        this.target = this.event.target as HTMLElement;
        this.document = this.target.ownerDocument;
        // 提前记录按下位置，拖拽激活时才能保留鼠标在标签内的抓取偏移。
        props.options.onPosition({ x: this.event.clientX, y: this.event.clientY });
        this.document.addEventListener('pointermove', this.move, { passive: false });
        this.document.addEventListener('pointerup', this.end);
        this.document.addEventListener('pointercancel', this.cancel);
        this.document.defaultView?.addEventListener('dragstart', this.preventDefault);
        try {
            this.target.setPointerCapture(this.event.pointerId);
        } catch {
            // 合成事件或不支持指针捕获的平台仍可通过 document 监听完成拖拽。
        }
    }

    private preventDefault = (event: Event) => event.preventDefault();
    private stopClick = (event: Event) => event.stopPropagation();
    private clearSelection = () => this.document.getSelection()?.removeAllRanges();

    private move = (event: PointerEvent) => {
        if (event.pointerId !== this.event.pointerId) return;
        if (!this.activated) {
            // 保留 10 像素的点击容差，避免点击切换标签时误触发分屏。
            if (
                Math.hypot(event.clientX - this.event.clientX, event.clientY - this.event.clientY) <
                10
            )
                return;
            this.activated = true;
            this.document.addEventListener('click', this.stopClick, true);
            this.document.addEventListener('selectionchange', this.clearSelection);
            this.clearSelection();
            // dnd-kit 以按下位置作为起点；随后再传递当前位置，避免预览突然跳位。
            this.props.onStart({ x: this.event.clientX, y: this.event.clientY });
        }
        event.preventDefault();
        const point = { x: event.clientX, y: event.clientY };
        this.props.options.onPosition(point);
        this.props.onMove(point);
    };

    private end = (event: PointerEvent) => {
        if (event.pointerId !== this.event.pointerId) return;
        // 松手前再同步坐标，确保最终落点包含最后一帧的鼠标移动。
        this.props.options.onPosition({ x: event.clientX, y: event.clientY });
        this.detach();
        this.props.onEnd();
    };

    private cancel = () => {
        this.detach();
        this.props.onCancel();
    };

    private detach() {
        this.document.removeEventListener('pointermove', this.move);
        this.document.removeEventListener('pointerup', this.end);
        this.document.removeEventListener('pointercancel', this.cancel);
        this.document.removeEventListener('selectionchange', this.clearSelection);
        this.document.defaultView?.removeEventListener('dragstart', this.preventDefault);
        // 松手后浏览器还会派发 click，延迟解绑以免拖拽结束又触发一次标签点击。
        window.setTimeout(
            () => this.document.removeEventListener('click', this.stopClick, true),
            0,
        );
        try {
            this.target.releasePointerCapture(this.event.pointerId);
        } catch {
            // 浏览器可能已在 pointerup 时自动释放捕获，无需重复处理。
        }
    }
}
