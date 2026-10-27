using System.Diagnostics;
using System.Windows.Forms;

namespace GuangyuOpenHelper;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        string? error = null;
        string targetPath;
        if (args.Length != 1 || !TryGetLocalTarget(args.FirstOrDefault() ?? string.Empty, out targetPath, out error))
        {
            MessageBox.Show(error ?? "打开请求无效。请从光域空间重新点击资料链接。", "光域空间本机资料工具", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 2;
        }

        if (!File.Exists(targetPath) && !Directory.Exists(targetPath))
        {
            MessageBox.Show($"找不到这个本机文件或文件夹：\n{targetPath}", "光域空间本机资料工具", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 3;
        }

        try
        {
            Process.Start(new ProcessStartInfo { FileName = targetPath, UseShellExecute = true });
            MessageBox.Show("已交给 Windows 默认应用打开。", "光域空间本机资料工具", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception or UnauthorizedAccessException)
        {
            MessageBox.Show($"Windows 未能用默认应用打开：\n{exception.Message}", "光域空间本机资料工具", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 4;
        }
    }

    private static bool TryGetLocalTarget(string rawRequest, out string targetPath, out string? error)
    {
        targetPath = string.Empty;
        error = null;
        if (!Uri.TryCreate(rawRequest, UriKind.Absolute, out var request) ||
            request.Scheme != "guangyu-open" || request.Host != "open" ||
            !request.Query.StartsWith("?target=", StringComparison.Ordinal))
        {
            error = "打开请求无效。请从光域空间重新点击资料链接。";
            return false;
        }

        var encodedTarget = request.Query["?target=".Length..];
        if (!Uri.TryCreate(Uri.UnescapeDataString(encodedTarget), UriKind.Absolute, out var target) ||
            !target.IsFile || (!string.IsNullOrEmpty(target.Host) && !string.Equals(target.Host, "localhost", StringComparison.OrdinalIgnoreCase)) ||
            target.IsUnc || !string.IsNullOrEmpty(target.UserInfo) || !string.IsNullOrEmpty(target.Query) || !string.IsNullOrEmpty(target.Fragment))
        {
            error = "只允许打开当前 Windows 设备上的本机文件或文件夹。";
            return false;
        }

        targetPath = Path.GetFullPath(target.LocalPath);
        if (!Path.IsPathFullyQualified(targetPath))
        {
            error = "资料路径必须是完整的本机路径。";
            return false;
        }
        return true;
    }
}
