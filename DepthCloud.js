import {CreateAxisRotationMatrix,Multiply3,GetRayPositionAtTime,MatrixMultiply4x4,CreateScaleMatrix,GetMatrixTransposed,MatrixInverse4x4,CreateTranslationScaleMatrix,BoxCenterSizeToMinMax,GetMatrixTranslation,SetMatrixTranslation} from './PopEngine/Math.js'
import Camera_t from './PopEngine/Camera.js'
import Pop from './PopEngine/PopEngine.js'
import Params from './Params.js'


const DrawCameraFrustum = true;
const DebugCameraSize = 0.01;
const DebugRaySize = 0.008;
		

function GenerateVoxelUvs(Width,Height)
{
	let Uvs = [];
	for ( let y=0;	y<Height;	y++ )
	{
		for ( let x=0;	x<Width;	x++ )
		{
			let u = x/Width;
			let v = y/Height;
			Uvs.push(u,v);
		}
	}
	Uvs = new Float32Array(Uvs);
	return Uvs;
}

let VoxelUvCache = {};
function GetVoxelUvs(Width,Height)
{
	const Key = `${Width}x${Height}`;
	if ( !VoxelUvCache[Key] )
	{
		VoxelUvCache[Key] = GenerateVoxelUvs(Width,Height);
	}
	return VoxelUvCache[Key];
}

export class DepthCloud_t
{
	constructor()
	{
		this.DepthCamera = null;
		this.BoundingBox = null;
	}

	//	should this really be a member? maybe the class should be more dumb
	//	gr: it should also not rely on some external render camera uniforms
	GetRenderCommands(PushCommand,RenderContext,CameraUniforms,AssetManager,BoundingBoxShader,PlainColourShader,ProjectedGeoShader)
	{
		//	camera position
		{
			const Uniforms = Object.assign({},CameraUniforms);
			const Geo = AssetManager.GetAsset('Cube',RenderContext);
			//const Shader = AssetManager.GetAsset(BoundingBoxShader,RenderContext);
			const Shader = AssetManager.GetAsset(PlainColourShader,RenderContext);
			
			Uniforms.Colour = [1,0,0,1];
			Uniforms.LocalToWorldTransform = this.DepthCamera.GetLocalToWorldMatrix();
			const Scale = CreateScaleMatrix(DebugCameraSize);
			Uniforms.LocalToWorldTransform = MatrixMultiply4x4( Uniforms.LocalToWorldTransform, Scale );

			const DrawCube = ['Draw',Geo,Shader,Uniforms];
			PushCommand( DrawCube );
		}
		if ( false)
		{
			const Uniforms = Object.assign({},CameraUniforms);
			const Geo = AssetManager.GetAsset('Cube',RenderContext);
			//const Shader = AssetManager.GetAsset(BoundingBoxShader,RenderContext);
			const Shader = AssetManager.GetAsset(PlainColourShader,RenderContext);
			
			Uniforms.Colour = [0,1,0,1];
			let Translation = this.DepthCamera.Position;
			let Scale = [DebugCameraSize,DebugCameraSize,DebugCameraSize];
			const LocalToWorld = CreateTranslationScaleMatrix(Translation,Scale);
			Uniforms.LocalToWorldTransform = [LocalToWorld];
			
			const DrawCube = ['Draw',Geo,Shader,Uniforms];
			PushCommand( DrawCube );
		}
		
		if( false )
		{
			const Geo = AssetManager.GetAsset('Cube',RenderContext);
			//const Shader = AssetManager.GetAsset(BoundingBoxShader,RenderContext);
			const Shader = AssetManager.GetAsset(PlainColourShader,RenderContext);
			
			let LocalToWorlds = [];
			for ( let z=0;	z<=2;	z+=0.05)
			{
				for ( let u=0;	u<1;	u+=0.1 )
				{
					for ( let v=0;	v<1;	v+=0.1 )
					{
						const Ray = this.DepthCamera.GetScreenRay(u,v,[0,0,1,1],1);
						
						let Translation = GetRayPositionAtTime( Ray.Start, Ray.Direction, -z );
						let Scale = [DebugRaySize,DebugRaySize,DebugRaySize];
						const LocalToWorld = CreateTranslationScaleMatrix(Translation,Scale);
						LocalToWorlds.push(LocalToWorld);
						
					}
				}
			}
			const Uniforms = Object.assign({},CameraUniforms);
			Uniforms.LocalToWorldTransform = LocalToWorlds;
			Uniforms.Colour = [0,1,0,1];

			const DrawCube = ['Draw',Geo,Shader,Uniforms];
			PushCommand( DrawCube );
		}
		
		//	camera Frustum
		if( DrawCameraFrustum )
		{
			const Uniforms = Object.assign({},CameraUniforms);
			const Geo = AssetManager.GetAsset('Cube',RenderContext);
			//const Shader = AssetManager.GetAsset(PlainColourShader,RenderContext);
			const Shader = AssetManager.GetAsset(BoundingBoxShader,RenderContext);
			
			const LocalToWorld = this.DepthCamera.GetLocalToWorldFrustumTransformMatrix([0,0,1,1]);
			Uniforms.LocalToWorldTransform = [LocalToWorld];
			Uniforms.Colour = [0,1,0,1];
			
			const DrawCube = ['Draw',Geo,Shader,Uniforms];
			PushCommand( DrawCube );
		}
		
		if ( false)
		{
			const Uniforms = Object.assign({},CameraUniforms);
			const Geo = AssetManager.GetAsset('Cube',RenderContext);
			//const Shader = AssetManager.GetAsset(BoundingBoxShader,RenderContext);
			const Shader = AssetManager.GetAsset(PlainColourShader,RenderContext);
			
			Uniforms.Colour = [0,1,0,1];
			let Translation = this.DepthCamera.Position;
			let Scale = [DebugCameraSize,DebugCameraSize,DebugCameraSize];
			const LocalToWorld = CreateTranslationScaleMatrix(Translation,Scale);
			Uniforms.LocalToWorldTransform = [LocalToWorld];
			
			const DrawCube = ['Draw',Geo,Shader,Uniforms];
			PushCommand( DrawCube );
		}

		if ( this.DepthImage )
		{
			const Uniforms = Object.assign({},CameraUniforms);
			const Geo = AssetManager.GetAsset('UnitCube',RenderContext);
			const Shader = AssetManager.GetAsset(ProjectedGeoShader,RenderContext);
			
			const ViewToWorld = this.DepthCamera.GetLocalToWorldFrustumTransformMatrix([0,0,1,1]);

			Object.assign( Uniforms, Params );
	
			Uniforms.DepthViewToWorldTransform = ViewToWorld;
			Uniforms.DepthViewToCameraTransform = this.DepthCamera.GetScreenToCameraTransform([0,0,1,1]);
			Uniforms.DepthCameraToWorldTransform = this.DepthCamera.GetLocalToWorldMatrix();
			
			Uniforms.LocalToWorldTransform = CreateTranslationScaleMatrix([0,0,0],[1,1,1]);
			Uniforms.DepthImage = this.DepthImage;
			Uniforms.DepthImageRect = this.DepthImageRect;
			Uniforms.DepthImageCrop = this.DepthImageCrop;
			//Uniforms.VoxelUv = GetVoxelUvs( this.DepthImage.GetWidth(), this.DepthImage.GetHeight() );
			Uniforms.VoxelUv = GetVoxelUvs( 250, 250 );
			Uniforms.VoxelSize = 1/100;///10;//0.5/100;//1/this.DepthImage.GetWidth();
			//Uniforms.VoxelUv = GetVoxelUvs(1,1);
			//Uniforms.VoxelSize = 1;
			Uniforms.ColourImage = this.DepthImage;
			Uniforms.TimeSecs = Pop.GetTimeNowMs()/1000;
			Uniforms.DepthCamera_focalLength = [this.DepthCamera.PixelFocals.fx,this.DepthCamera.PixelFocals.fy];
			Uniforms.DepthCamera_principalPoint = [this.DepthCamera.PixelFocals.cx,this.DepthCamera.PixelFocals.cy];
			Uniforms.DepthCamera_imageDimensions = this.DepthCamera.PixelFocals.ImageSize;
			Uniforms.DepthCamera_maxdepth = this.DepthCamera.FarDistance;
			Uniforms.DepthCamera_mindepth = this.DepthCamera.NearDistance;

			const State = {};
			//State.BlendMode = 'Alpha';
			
			const DrawCube = ['Draw',Geo,Shader,Uniforms,State];
			PushCommand( DrawCube );
		}
	}
}

export async function LoadDepthkitDepthClouds(Meta,AtlasImage)
{
	const FlipY = -1;
	const BoxCenter = [Meta.boundsCenter.x,FlipY*Meta.boundsCenter.y,Meta.boundsCenter.z];
	const BoxSize = [Meta.boundsSize.x,Meta.boundsSize.y,Meta.boundsSize.z];
	const BoundingBox = BoxCenterSizeToMinMax(BoxCenter,BoxSize);
	
	const Clouds = [];
	
	//for ( let Perspective of Meta.perspectives )
	for ( let PerspectiveIndex=0;	PerspectiveIndex<Meta.perspectives.length;	PerspectiveIndex++ )
	{
		const Perspective = Meta.perspectives[PerspectiveIndex];
		const DepthCamera = new Camera_t();
		
		const Ext = Perspective.extrinsics;
		let CameraToWorld =
		[
			Ext.e00, Ext.e10, Ext.e20, Ext.e30,
			Ext.e01, Ext.e11, Ext.e21, Ext.e31,
			Ext.e02, Ext.e12, Ext.e22, Ext.e32,
			Ext.e03, Ext.e13, Ext.e23, Ext.e33,
		];
		let AxisConversionPointInwards =
		[
			0,-1,0,0,
			1,0,0,0,
			0,0,1,0,
			0,0,0,1
		];
		let AxisConversionPointOutwards =
		[
			0,1,0,0,
			1,0,0,0,
			0,0,-1,0,
			0,0,0,1
		];
		let AxisConversionPointOutwardsFlip =
		[
			0,1,0,0,
			-1,0,0,0,
			0,0,-1,0,
			0,0,0,1
		];
		/*
		AxisConversion1 =
		[
			1,0,0,0,
			0,1,0,0,
			0,0,1,0,
			0,0,0,1
		];
		*/
		//CameraToWorld = MatrixMultiply4x4( CameraToWorld, AxisConversionPointInwards );
		//CameraToWorld = MatrixMultiply4x4( CameraToWorld, AxisConversionPointOutwards );
		CameraToWorld = MatrixMultiply4x4( CameraToWorld, AxisConversionPointOutwardsFlip );
		
		
		//	draw in a row
		if( false )
		CameraToWorld = 
		[
			1,	0,	0,	0,
			0,					1,	0,	0,
			0,					0,	-1,	0,
			PerspectiveIndex,					0,	0,	1
			//Ext.e03, Ext.e13, Ext.e23, Ext.e33,
		];
		
		
		DepthCamera.Rotation4x4 = CameraToWorld.slice();
		DepthCamera.Position = GetMatrixTranslation(CameraToWorld,true);
		DepthCamera.Position[1] *= FlipY;
		SetMatrixTranslation(DepthCamera.Rotation4x4,0,0,0);
		DepthCamera.NearDistance = Perspective.nearClip;

		DepthCamera.FarDistance = Perspective.farClip;
		//DepthCamera.ZForwardIsNegative = true;
		DepthCamera.FovVertical = 110;
		//DepthCamera.FocalCenterOffset = [Perspective.depthPrincipalPoint.x,Perspective.depthPrincipalPoint.y];
		
		DepthCamera.PixelFocals = {};
		DepthCamera.PixelFocals.ImageSize = [Perspective.depthImageSize.x,Perspective.depthImageSize.y];
		DepthCamera.PixelFocals.fx = Perspective.depthFocalLength.x;
		DepthCamera.PixelFocals.fy = Perspective.depthFocalLength.y;
		DepthCamera.PixelFocals.cx = Perspective.depthPrincipalPoint.x;
		DepthCamera.PixelFocals.cy = Perspective.depthPrincipalPoint.y;
		/*
		const ProjectionMatrix =
		[
			fx,s,cx,0,
			0,fy,cy,0,
			0,0,near,1,
			0,0,far,0
		];
		clipEpsilon: 0.001497264951467514
		crop: {w: 0.7058823108673096, x: 0.1234983429312706, y: 0.29411765933036804, z: 0.46684208512306213}
		depthFocalLength: {x: 1220.7437744140625, y: 1220.0621337890625}
		depthImageSize: {x: 2560, y: 1440}
		depthPrincipalPoint: {x: 1282.904541015625, y: 734.1951293945312}
		extrinsics: {e00: 0.014244511723518372, e01: 0.24420921504497528, e02: 0.9696179628372192, e03: 1.9772436618804932, e10: -0.9979629516601562, ???}
		farClip: 3.5880143642425537
		nearClip: 0.24859213829040527
		*/
		//	probably need to split this into colour rect & depth rect
		const Crop = Perspective.crop;
		//Crop.x = 0;
		//Crop.y = 0;	
		const CropRect = [Crop.x,Crop.y,Crop.z,Crop.w];
		const CellsWidth = 3;
		const CellsHeight = 2;
		const DepthImageRect =
		[
			(PerspectiveIndex%CellsWidth) / CellsWidth,
			Math.floor(PerspectiveIndex/CellsWidth) / CellsHeight,
			1/CellsWidth,
			1/CellsHeight,
		];
	
		
		const Cloud = new DepthCloud_t();
		Cloud.DepthImageRect = DepthImageRect;
		Cloud.DepthImage = AtlasImage;
		Cloud.DepthImageCrop = CropRect;
		Cloud.BoundingBox = BoundingBox;
		Cloud.DepthCamera = DepthCamera;
		//if ( PerspectiveIndex == 3 )
		Clouds.push(Cloud);
		if ( PerspectiveIndex == 199 )
			break;
	}
	
	console.log(`LoadDepthkitDepthClouds`,Meta);

	return Clouds;
}
