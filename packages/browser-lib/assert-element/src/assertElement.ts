type ConstructorOf<T> = {
    new (...args: any[]): T;
};

export function assertElement<T extends HTMLElement>(
    elementType: ConstructorOf<T>,
    selector: string,
): T {
    const instance = document.querySelector(selector);
    if (instance instanceof elementType) {
        return instance;
    } else {
        throw new Error(`Selector ${selector} was not a ${elementType.name}`);
    }
}
