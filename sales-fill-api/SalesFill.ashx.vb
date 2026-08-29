Imports System.Collections.Generic
Imports System.Configuration
Imports System.IO
Imports System.Text
Imports System.Web
Imports System.Web.Script.Serialization

''' <summary>
''' 销售人员回填查询接口（按工作单号批量查内部库，返回 工作单号→销售姓名 映射）。
''' 契约与调用方约定一致：POST + JSON 请求体 { "workOrderNos": [...] }；
''' 响应为纯 JSON 对象 { "工作单号": "姓名" }，未命中的工作单号不出现在响应中；
''' 调用方超时阈值 5s，本接口须在此之内返回。
''' </summary>
Public Class SalesFillHandler
    Implements IHttpHandler

    ''' 单次请求允许的最大工作单号数量（SQL Server 参数化占位上限约 2100，留出余量）
    Private Const MAX_WORK_ORDER_COUNT As Int32 = 2000

    Public ReadOnly Property IsReusable As Boolean Implements IHttpHandler.IsReusable
        Get
            Return False
        End Get
    End Property

    Public Sub ProcessRequest(ByVal context As HttpContext) Implements IHttpHandler.ProcessRequest
        context.Response.ContentType = "application/json; charset=utf-8"
        context.Response.ContentEncoding = Encoding.UTF8

        Try
            ' 仅接受 POST，其余方法一律拒绝
            If Not String.Equals(context.Request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase) Then
                WriteJson(context, 405, "{""error"":""method not allowed""}")
                Return
            End If

            ' 请求头 X-Fill-Token 与 Web.config 的 FillApiToken 比对，不一致或缺失返回 401
            If Not VerifyToken(context) Then
                WriteJson(context, 401, "{""error"":""unauthorized""}")
                Return
            End If

            ' 解析请求体：解析失败/缺 workOrderNos 返回 400，空数组直接返回空映射
            Dim llistWorkOrderNos As List(Of String) = ParseWorkOrderNos(context)
            If llistWorkOrderNos Is Nothing Then
                WriteJson(context, 400, "{""error"":""invalid request body""}")
                Return
            End If
            If llistWorkOrderNos.Count = 0 Then
                WriteJson(context, 200, "{}")
                Return
            End If
            If llistWorkOrderNos.Count > MAX_WORK_ORDER_COUNT Then
                WriteJson(context, 400, "{""error"":""too many work order numbers""}")
                Return
            End If

            Dim lmapResult As Dictionary(Of String, String) = QuerySalesNames(llistWorkOrderNos)
            Dim lser As New JavaScriptSerializer()
            WriteJson(context, 200, lser.Serialize(lmapResult))
        Catch ex As Exception
            ' 任何未预期异常都兜住：记录具体原因，对外只返回通用错误，不暴露 SQL/连接串细节
            LogError("SalesFill 处理异常", ex)
            WriteJson(context, 500, "{""error"":""internal error""}")
        End Try
    End Sub

    ''' <summary>
    ''' 校验请求头 X-Fill-Token；未配置 FillApiToken 视为部署失误，一律拒绝，避免接口裸奔。
    ''' </summary>
    Private Function VerifyToken(ByVal context As HttpContext) As Boolean
        Dim lsConfigToken As String = ConfigurationManager.AppSettings("FillApiToken")
        If String.IsNullOrEmpty(lsConfigToken) OrElse lsConfigToken.StartsWith("change-me") Then
            Return False
        End If
        Dim lsReqToken As String = context.Request.Headers("X-Fill-Token")
        Return String.Equals(lsReqToken, lsConfigToken, StringComparison.Ordinal)
    End Function

    ''' <summary>
    ''' 解析请求体中的 workOrderNos：去空白、去重（忽略大小写），只保留非空字符串；
    ''' 请求体不是合法 JSON 对象或缺 workOrderNos 数组时返回 Nothing（由调用方回 400）。
    ''' </summary>
    Private Function ParseWorkOrderNos(ByVal context As HttpContext) As List(Of String)
        Dim lsBody As String
        Using lreader As New StreamReader(context.Request.InputStream, context.Request.ContentEncoding)
            lsBody = lreader.ReadToEnd()
        End Using
        If String.IsNullOrWhiteSpace(lsBody) Then
            Return Nothing
        End If

        Dim lser As New JavaScriptSerializer()
        Dim lobjBody As Object
        Try
            lobjBody = lser.DeserializeObject(lsBody)
        Catch
            Return Nothing
        End Try

        Dim ldictBody As Dictionary(Of String, Object) = TryCast(lobjBody, Dictionary(Of String, Object))
        If ldictBody Is Nothing OrElse Not ldictBody.ContainsKey("workOrderNos") Then
            Return Nothing
        End If

        Dim lobjArray As Object() = TryCast(ldictBody("workOrderNos"), Object())
        If lobjArray Is Nothing Then
            Return Nothing
        End If

        Dim llistResult As New List(Of String)
        Dim lsetSeen As New HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
        For Each lobjItem As Object In lobjArray
            Dim lsItem As String = TryCast(lobjItem, String)
            If lsItem IsNot Nothing Then
                lsItem = lsItem.Trim()
                If lsItem.Length > 0 AndAlso lsetSeen.Add(lsItem) Then
                    llistResult.Add(lsItem)
                End If
            End If
        Next
        Return llistResult
    End Function

    ''' <summary>
    ''' 用参数化 SQL 查内部库，把命中结果收敛为 工作单号→销售姓名 映射；
    ''' 空值/空白值一律不入映射（调用方按未命中处理）。
    ''' </summary>
    Private Function QuerySalesNames(ByVal llistWorkOrderNos As List(Of String)) As Dictionary(Of String, String)
        Dim lmapResult As New Dictionary(Of String, String)(StringComparer.OrdinalIgnoreCase)
        Dim lws As New Fcl.WSOP.sqldbop
        Try
            lws.Init(ConfigurationManager.AppSettings("InternalDbConnectionString"))
            Dim lsb As Fcl.WSOP.SqlBuilder = BuildSalesSql(llistWorkOrderNos)
            Dim ldt As DataTable = lws.GetTable(lsb)
            If ldt IsNot Nothing Then
                For Each lrow As DataRow In ldt.Rows
                    If lrow.IsNull("work_order_no") OrElse lrow.IsNull("sales_name") Then
                        Continue For
                    End If
                    Dim lsNo As String = lrow("work_order_no").ToString().Trim()
                    Dim lsName As String = lrow("sales_name").ToString().Trim()
                    If lsNo.Length > 0 AndAlso lsName.Length > 0 AndAlso Not lmapResult.ContainsKey(lsNo) Then
                        lmapResult.Add(lsNo, lsName)
                    End If
                Next
            End If
        Finally
            Try
                lws.Quit()
            Catch
                ' 释放失败不影响响应结果
            End Try
        End Try
        Return lmapResult
    End Function

    ''' <summary>
    ''' ============================================================
    ''' 【占位 SQL · 待替换】
    ''' 真实查询 SQL 由任务发起人提供后仅替换下方 SELECT 语句；
    ''' 约定结果集必须包含两列：work_order_no（工作单号）、sales_name（销售姓名），
    ''' 列名不一致时需同步调整 QuerySalesNames 的取列代码。
    ''' 占位 ? 与参数数组逐个绑定，禁止字符串拼接工作单号。
    ''' ============================================================
    ''' </summary>
    Private Function BuildSalesSql(ByVal llistWorkOrderNos As List(Of String)) As Fcl.WSOP.SqlBuilder
        Dim lsbPlaceholders As New StringBuilder()
        Dim lobjParams(llistWorkOrderNos.Count - 1) As Object
        For lnIndex As Int32 = 0 To llistWorkOrderNos.Count - 1
            If lnIndex > 0 Then
                lsbPlaceholders.Append(",")
            End If
            lsbPlaceholders.Append("?")
            lobjParams(lnIndex) = llistWorkOrderNos(lnIndex)
        Next

        Dim lsSql As String = "SELECT work_order_no, sales_name FROM d_sales_workorder WHERE work_order_no IN (" + lsbPlaceholders.ToString() + ")"
        Return New Fcl.WSOP.SqlBuilder(lsSql, lobjParams)
    End Function

    Private Sub WriteJson(ByVal context As HttpContext, ByVal lnStatusCode As Int32, ByVal lsJson As String)
        context.Response.StatusCode = lnStatusCode
        context.Response.Write(lsJson)
    End Sub

    Private Sub LogError(ByVal lsMessage As String, ByVal ex As Exception)
        Try
            EventLog.WriteEntry("SalesFillApi", lsMessage + "：" + ex.ToString(), EventLogEntryType.Error)
        Catch
            ' 日志写入失败不影响响应
        End Try
    End Sub

End Class
