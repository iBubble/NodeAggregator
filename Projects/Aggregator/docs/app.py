import os
import sys
import subprocess
import time
import http.server
import socketserver
import threading
import webbrowser

# 配置
AGGREGATOR_DIR = os.path.join(os.getcwd(), "external", "aggregator")
DATA_DIR = os.path.join(AGGREGATOR_DIR, "data")
OUTPUT_FILE = "clash_verge_subs.yaml"
PORT = 8088

def print_header():
    print("=" * 50)
    print("   Antigravity Airport Aggregator & Server")
    print("   [自动获取 -> 测速优化 -> 本地订阅]")
    print("=" * 50)

def check_environment():
    print("[*] 检查环境...")
    if not os.path.exists(AGGREGATOR_DIR):
        print(f"[-] 核心组件未找到: {AGGREGATOR_DIR}")
        print("[-] 请等待 Git Clone 完成或检查路径。")
        return False
    # 检查依赖 (主要看是否有 venv 或已安装)
    # 这里简化处理，假设用户会安装 requirements
    return True

def install_dependencies():
    print("[*] 正在安装/更新依赖...")
    req_path = os.path.join(AGGREGATOR_DIR, "requirements.txt")
    if os.path.exists(req_path):
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", req_path])
        # 额外安装 pyyaml 等可能需要的库
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyyaml", "requests"])
    else:
        print("[-] 未找到 requirements.txt")

def run_aggregator(skip_check=False):
    """
    运行聚合逻辑。
    """
    print("\n[*] 启动节点获取任务...")
    if not skip_check:
        print("[!] 已启用严格测速模式，将自动剔除超时/无效节点。")
        print("[!] 这可能需要较长时间(视网络情况而定)，请耐心等待...")
    else:
        print("[!] 快速模式: 仅抓取不验证。")
    
    script_path = os.path.join(AGGREGATOR_DIR, "subscribe", "collect.py") 
    
    if not os.path.exists(script_path):
        # 尝试寻找可能的入口
        possible_entries = ["collect.py", "main.py", "run.py"]
        found = False
        for entry in possible_entries:
            p = os.path.join(AGGREGATOR_DIR, entry)
            if os.path.exists(p):
                script_path = p
                found = True
                break
        if not found:
             # 如果都在子目录
             p = os.path.join(AGGREGATOR_DIR, "subscribe", "collect.py")
             if os.path.exists(p):
                 script_path = p
                 found = True
        
        if not found:
            print(f"[-] 无法定位 aggregator 入口脚本。")
            return

    # 运行脚本
    try:
        env = os.environ.copy()
        env["PYTHONPATH"] = AGGREGATOR_DIR
        
        # 基础参数
        args = [sys.executable, script_path, "--overwrite"]
        
        # 根据模式调整参数
        if skip_check:
            args.append("--skip") # 跳过检测
        else:
            # 不跳过检测，并设定超时时间
            args.extend(["--delay", "3000"]) # 仅保留 3000ms 响应内的节点
            # args.extend(["--url", "http://www.gstatic.com/generate_204"]) # 可选: 指定测速链接

        subprocess.run(args, env=env, cwd=AGGREGATOR_DIR)
        print("[+] 任务完成！结果已更新至 data 目录。")
    except Exception as e:
        print(f"[-] 运行出错: {e}")

def start_server():
    """
    启动一个简单的 HTTP 服务器 host data 目录
    """
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=DATA_DIR, **kwargs)

    print(f"\n[*] 启动本地订阅服务器位于端口 {PORT}...")
    print(f"[+] 您的 Clash Verge 订阅地址为: http://127.0.0.1:{PORT}/clash.yaml")
    print("[!] (文件名取决于生成的结果，通常是 proxies.yaml 或 clash.yaml)")
    print("[!] 提示: 如果 Clash Verge 提示下载失败，请尝试文件名 clash.yaml 或 proxies.yaml")
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"[*] 服务运行中... 按 Ctrl+C 停止")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[*] 停止服务器...")
            httpd.server_close()

def main():
    print_header()
    if not check_environment():
        return

    while True:
        print("\n请选择操作:")
        print("1. 安装依赖 (首次运行推荐)")
        print("2. 执行: 获取所有节点 (快速, 跳过测速)")
        print("3. 执行: 获取优选节点 (较慢, 严格测速 - 推荐)")
        print("4. 启动: 本地订阅服务器 (供 Clash 连接)")
        print("5. 打开 Clash Verge (仅 macOS)")
        print("q. 退出")
        
        choice = input("\n> ").strip().lower()
        
        if choice == '1':
            install_dependencies()
        elif choice == '2':
            run_aggregator(skip_check=True)
        elif choice == '3':
            run_aggregator(skip_check=False)
        elif choice == '4':
            start_server()
        elif choice == '5':
            os.system("open -a 'Clash Verge'")
        elif choice == 'q':
            sys.exit(0)
        else:
            print("无效选项")

if __name__ == "__main__":
    main()
